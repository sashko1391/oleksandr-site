#!/usr/bin/env node
// Browser smoke for every lead form on the site (/services/, five landings, the /pricing/ brief) plus the
// /services/ page specifics: CTA tracking, honeypot, timeout and mobile a11y.
// The Worker is stubbed and every other external request is aborted — nothing leaves the machine.
// `npm run smoke:forms [-- --screenshots <dir>]` (Playwright + system Chrome; not part of `npm test`).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const WORKER = 'https://oleksandr-site.sashko1391.workers.dev';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml',
};
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Every page that can send a lead: how to fill it and what «sent» looks like there. */
const FORM_PAGES = [
  { path: '/services/', label: 'services_form', form: '#leadForm', success: '#leadStatus', successText: 'Дякую',
    fill: async (page) => { await page.fill('#lf-name', 'ТЕСТ'); await page.fill('#lf-contact', '@test_contact'); await page.fill('#lf-message', 'smoke'); } },
  ...['ai', 'kyiv', 'landing', 'nextjs', 'redesign'].map((slug) => ({
    path: `/services/${slug}/`, label: `${slug}_form`, form: '#leadForm', success: '#leadSuccess', successText: 'Дякую',
    fill: async (page) => {
      await page.fill('#leadForm input[name="name"]', 'ТЕСТ');
      await page.fill('#leadForm input[name="phone"]', '@test_contact');
      await page.fill('#leadForm textarea[name="desc"]', 'smoke');
    },
  })),
  { path: '/pricing/', label: 'pricing_form', form: '#briefForm', success: '#briefSuccess', successText: 'Дякую',
    fill: async (page) => {
      await page.locator('#briefForm input[name="site_type"]').first().check();
      await page.locator('#briefForm input[name="budget_range"]').first().check();
      await page.fill('#briefForm [name="contact"]', '@test_contact');
    } },
];

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = normalize(join(PUBLIC, path));
    if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return res.writeHead(403).end();
    if (path.endsWith('/')) file = join(file, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

/**
 * Open /services/ with the Worker answering `workerStatus` (or never, with `workerHangs`); returns the page and the
 * payloads it received. `clock` installs Playwright's fake timers so a test can fast-forward the page's timeout.
 */
async function open(browser, base, { path = '/services/', workerStatus = 200, workerHangs = false, workerPlan = null, clock = false, javaScript = true, viewport = DESKTOP } = {}) {
  const context = await browser.newContext({ viewport, javaScriptEnabled: javaScript });
  const sent = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    if (request.url().startsWith(base)) return route.continue();
    if (request.url().startsWith(WORKER)) {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      sent.push(request.postDataJSON());
      if (workerHangs) return undefined; // never answer: the page has to give up on its own
      const plan = workerPlan ? workerPlan(sent.length) : { status: workerStatus };
      const answer = () => route.fulfill({ status: plan.status, headers: cors, contentType: 'application/json', body: '{}' });
      return plan.delayMs ? new Promise((done) => setTimeout(() => answer().then(done), plan.delayMs)) : answer();
    }
    return route.abort(); // GA, Clarity, Plausible
  });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  await page.goto(base + path, { waitUntil: 'load' });
  return { page, sent, context };
}

/** gtag() of the inline GA snippet only queues into dataLayer (gtag.js is aborted) — read events from there. */
const events_ = (page) =>
  page.evaluate(() => (window.dataLayer || []).map((a) => Array.from(a)).filter((a) => a[0] === 'event').map((a) => ({ name: a[1], params: a[2] })));

async function fillForm(page, { name = 'Тест', contact = '@test_contact', message = 'Потрібен лендінг' } = {}) {
  await page.fill('#lf-name', name);
  await page.fill('#lf-contact', contact);
  await page.fill('#lf-message', message);
}


/** Every form on the site: a lead that is accepted, one that is refused, and the page without JavaScript. */
async function formChecks(browser, base) {
  for (const form of FORM_PAGES) {
    const ok = await open(browser, base, { path: form.path });
    await form.fill(ok.page);
    await ok.page.click(`${form.form} button[type="submit"]`);
    await ok.page.locator(form.success).filter({ hasText: form.successText }).waitFor({ state: 'visible', timeout: 10000 });
    const payload = ok.sent[0] ?? {};
    const events = await events_(ok.page);
    const formVisible = await ok.page.locator(form.form).isVisible();
    check(`${form.path} — accepted lead: one request, contact and source, form hidden, generate_lead`,
      ok.sent.length === 1 && payload.contact === '@test_contact' && payload.source === form.path &&
      !formVisible && events.some((e) => e.name === 'generate_lead' && e.params?.event_label === form.label),
      JSON.stringify({ sent: ok.sent.length, contact: payload.contact, source: payload.source, formVisible, events: events.map((e) => e.name) }));
    await ok.context.close();

    const fail = await open(browser, base, { path: form.path, workerStatus: 500 });
    await form.fill(fail.page);
    await fail.page.click(`${form.form} button[type="submit"]`);
    await fail.page.locator('[data-lead-status]').filter({ hasText: 'Не вдалося' }).waitFor({ state: 'visible', timeout: 10000 });
    const failState = await fail.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return { visible: !!el.offsetParent, contact: (el.querySelector('[name="contact"], [name="phone"]') || {}).value };
    }, form.form);
    check(`${form.path} — refused lead: honest error, data kept, no generate_lead`,
      failState.visible && failState.contact === '@test_contact' &&
      !(await events_(fail.page)).some((e) => e.name === 'generate_lead'), JSON.stringify(failState));
    await fail.context.close();

    // Playwright's text engine cannot see inside <noscript>, so read the note through the DOM.
    const noJs = await open(browser, base, { path: form.path, javaScript: false });
    const hidden = !(await noJs.page.locator(form.form).isVisible());
    const notes = noJs.page.locator('noscript p');
    const note = await notes.first().isVisible() &&
      (await notes.first().evaluate((el) => el.textContent)).includes('лише з увімкненим JavaScript');
    const direct = await noJs.page.locator('a[href^="https://t.me/"]:visible').count() > 0;
    check(`${form.path} — without JavaScript: the form is hidden, the note and the direct contacts are shown`,
      hidden && note && direct, `hidden=${hidden} note=${note} direct=${direct}`);
    await noJs.context.close();
  }
}



/** The bot may only say «Записав» after a 2xx, and must say so plainly when storage is gone too. */
async function botHonestyChecks(browser, base) {
  for (const [name, storage, expect_] of [
    ['queued', true, 'зберіг розмову у вашому браузері'],
    ['lost', false, 'зберегти теж не вийшло'],
  ]) {
    const ctx = await open(browser, base, { path: '/services/', workerStatus: 500 });
    const { page } = ctx;
    if (!storage) {
      await page.evaluate(() => {
        // a browser with site data blocked: writing throws, exactly as in private mode
        Object.defineProperty(window, 'localStorage', { value: { getItem() { return null; }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } } });
      });
    }
    await page.fill('#chatInput', '@fresh_contact');
    await page.click('.chat-send');
    // a wrong message must fail the check, not crash the run
    await page.locator('.chat-messages').filter({ hasText: 'напряму' }).waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    const text = await page.locator('.chat-messages').innerText();
    check(`bot (${name}): says what really happened and never «Записав»`,
      text.includes(expect_) && !text.includes('Записав!'), text.slice(-160));
    await ctx.context.close();
  }
}

/** The scripted bot (on /services/ since Ф3) keeps a retry queue; flushing it must not swallow a fresh lead. */
async function botQueueChecks(browser, base) {
  // first call (the flush of the seeded lead) answers slowly; everything after it fails
  const ctx = await open(browser, base, {
    path: '/services/',
    workerPlan: (n) => (n === 1 ? { status: 200, delayMs: 10000 } : { status: 500 }),
  });
  const { page } = ctx;
  await page.evaluate(() => localStorage.setItem('chat_queue', JSON.stringify([
    { id: 'seeded-1', contact: '@seeded', history: 'seeded', source: '/services/', timestamp: new Date().toISOString() },
  ])));
  await page.reload({ waitUntil: 'load' });
  await page.fill('#chatInput', '@fresh_contact');
  await page.click('.chat-send');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('chat_queue') || '[]')).some((p) => p.contact === '@fresh_contact'), null, { timeout: 15000 });
  // the fresh lead must land while the flush is still waiting for its slow answer
  const duringFlush = await page.evaluate(() => JSON.parse(localStorage.getItem('chat_queue') || '[]'));
  check('/services/ bot: the flush is still in flight when the fresh lead is queued',
    duringFlush.some((p) => p.id === 'seeded-1'), JSON.stringify(duringFlush.map((p) => p.contact)));
  await page.waitForTimeout(12000); // let the slow flush finish and rewrite the queue
  const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('chat_queue') || '[]'));
  check('/services/ bot: a lead sent during a queue flush is not lost',
    queue.some((p) => p.contact === '@fresh_contact') && !queue.some((p) => p.id === 'seeded-1'),
    JSON.stringify(queue.map((p) => p.contact)));
  await ctx.context.close();
}

async function desktopChecks(browser, base) {
  // Happy path.
  const ok = await open(browser, base);
  check('H1 is visible', await ok.page.locator('h1').isVisible());
  check('FAQ answers are visible without interaction', await ok.page.locator('#faq .faq-item p').first().isVisible());
  await ok.page.click('a[data-cta="hero"]');
  const ctaEvent = (await events_(ok.page)).find((e) => e.name === 'cta_click');
  check('hero CTA scrolls to the form and reports cta_click', ok.page.url().endsWith('#contact') && ctaEvent?.params?.event_label === 'hero', JSON.stringify(ctaEvent));
  await fillForm(ok.page);
  await ok.page.click('#leadForm button[type="submit"]');
  await ok.page.waitForFunction(() => document.getElementById('leadStatus').textContent.includes('Дякую'));
  const payload = ok.sent[0] ?? {};
  check('submits exactly one lead to the Worker', ok.sent.length === 1, `sent ${ok.sent.length}`);
  check('the lead carries the contact and the page', payload.contact === '@test_contact' && payload.source === '/services/' && payload.history?.startsWith('ФОРМА (/services/)'), JSON.stringify(payload));
  check('reports generate_lead after the Worker accepted it', (await events_(ok.page)).some((e) => e.name === 'generate_lead'));
  // Visibility as the visitor sees it, not the `hidden` property: author CSS can override the attribute.
  const formVisible = await ok.page.locator('#leadForm').isVisible();
  const confirmationFocused = await ok.page.evaluate(() => document.activeElement.id === 'leadStatus');
  check('hides the form and focuses the confirmation', !formVisible && confirmationFocused, `formVisible=${formVisible} focused=${confirmationFocused}`);
  await ok.context.close();

  // Validation: empty and whitespace-only required fields never reach the Worker.
  const invalid = await open(browser, base);
  await invalid.page.click('#leadForm button[type="submit"]');
  await fillForm(invalid.page, { name: '   ' });
  await invalid.page.click('#leadForm button[type="submit"]');
  check('blocks empty and whitespace-only required fields', invalid.sent.length === 0 && !(await invalid.page.evaluate(() => document.getElementById('leadForm').checkValidity())));
  await invalid.context.close();

  // Honeypot: a filled hidden field looks like success to a bot but sends nothing.
  const bot = await open(browser, base);
  await fillForm(bot.page);
  await bot.page.evaluate(() => { document.getElementById('lf-extra').value = 'http://spam.example'; });
  await bot.page.click('#leadForm button[type="submit"]');
  await bot.page.waitForFunction(() => document.getElementById('leadStatus').textContent.includes('Дякую'));
  check('honeypot: sends nothing', bot.sent.length === 0, `sent ${bot.sent.length}`);
  await bot.context.close();

  // Worker failure: honest error, retry possible, no conversion reported.
  const fail = await open(browser, base, { workerStatus: 500 });
  await fillForm(fail.page);
  await fail.page.click('#leadForm button[type="submit"]');
  await fail.page.waitForFunction(() => document.getElementById('leadStatus').textContent.includes('Не вдалося'));
  const state = await fail.page.evaluate(() => {
    const button = document.querySelector('#leadForm button[type="submit"]');
    return { hidden: document.getElementById('leadForm').hidden, disabled: button.disabled, contact: document.getElementById('lf-contact').value };
  });
  check('on Worker error: keeps the form and its data, allows a retry', !state.hidden && !state.disabled && state.contact === '@test_contact', JSON.stringify(state));
  check('on Worker error: no generate_lead', !(await events_(fail.page)).some((e) => e.name === 'generate_lead'));
  await fail.context.close();

  // Worker never answers (blocked or black-holed *.workers.dev): no endless «Надсилаю…» — the timeout ends in the error.
  const hang = await open(browser, base, { workerHangs: true, clock: true });
  await fillForm(hang.page);
  await hang.page.click('#leadForm button[type="submit"]');
  const buttonText = () => hang.page.evaluate(() => document.querySelector('#leadForm button[type="submit"]').textContent);
  const waiting = (await buttonText()) === 'Надсилаю…' && hang.sent.length === 1;
  await hang.page.clock.fastForward(16000);
  let gaveUp = false;
  for (let i = 0; i < 50 && !gaveUp; i++) { // poll with Node timers: the page's timers are fake now
    gaveUp = await hang.page.evaluate(() => document.getElementById('leadStatus').textContent.includes('Не вдалося'));
    if (!gaveUp) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check('on a Worker that never answers: gives up after the timeout with the honest error', waiting && gaveUp && (await buttonText()) === 'Надіслати ще раз', `waiting=${waiting} gaveUp=${gaveUp}`);
  await hang.context.close();
}

async function mobileChecks(browser, base) {
  const { page, context } = await open(browser, base, { viewport: MOBILE });
  const hero = await page.evaluate(() => {
    const top = (selector) => document.querySelector(selector).getBoundingClientRect().bottom;
    return { h1: top('h1'), cta: top('a[data-cta="hero"]'), photo: top('.hero-photo'), height: innerHeight };
  });
  check('mobile: H1, photo and primary CTA are above the fold', hero.h1 < hero.height && hero.cta < hero.height && hero.photo < hero.height, JSON.stringify(hero));
  const small = await page.evaluate(() => {
    const targets = '.btn-primary, .btn-ghost, .contact-btn, .breadcrumbs a, .library a, .nav-back, .logo, .field input, .field textarea';
    return [...document.querySelectorAll(targets)]
      .filter((el) => el.offsetParent !== null && !el.closest('.hp'))
      .map((el) => ({ el: el.className || el.tagName, h: Math.round(el.getBoundingClientRect().height) }))
      .filter((t) => t.h < 48);
  });
  check('mobile: tap targets are at least 48px high', small.length === 0, JSON.stringify(small));
  const tiny = await page.evaluate(() => {
    const text = '.lead, .intro, .answer, .card p, .benefits p, .steps p, .case p, .faq-item p, .price-card p, .field input, .field textarea, .form-note';
    return [...document.querySelectorAll(text)]
      .map((el) => ({ el: el.className || el.tagName, px: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((t) => t.px < 16);
  });
  check('mobile: body text and inputs are at least 16px', tiny.length === 0, JSON.stringify(tiny.slice(0, 5)));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('mobile: no horizontal scroll', overflow <= 0, `overflow ${overflow}px`);
  await context.close();
}

async function screenshots(browser, base, dir) {
  for (const [name, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
    const { page, context } = await open(browser, base, { viewport });
    await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
    await page.screenshot({ path: join(dir, `services-${name}.png`), fullPage: true });
    await context.close();
  }
  console.log(`screenshots → ${dir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    await formChecks(browser, base);
    await botQueueChecks(browser, base);
    await botHonestyChecks(browser, base);
    await desktopChecks(browser, base);
    await mobileChecks(browser, base);
    const i = process.argv.indexOf('--screenshots');
    if (i !== -1) await screenshots(browser, base, process.argv[i + 1]);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(`smoke:forms — ${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
