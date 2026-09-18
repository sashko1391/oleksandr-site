#!/usr/bin/env node
// Browser smoke for /services/: the lead form, CTA tracking and mobile a11y, on a local static server.
// The Worker is stubbed and every other external request is aborted — nothing leaves the machine.
// `npm run smoke:services [-- --screenshots <dir>]` (Playwright + system Chrome; not part of `npm test`).
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

/** Open /services/ with the Worker answering `workerStatus`; returns the page and the payloads it received. */
async function open(browser, base, { workerStatus = 200, viewport = DESKTOP } = {}) {
  const context = await browser.newContext({ viewport });
  const sent = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    if (request.url().startsWith(base)) return route.continue();
    if (request.url().startsWith(WORKER)) {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      sent.push(request.postDataJSON());
      return route.fulfill({ status: workerStatus, headers: cors, contentType: 'application/json', body: '{}' });
    }
    return route.abort(); // GA, Clarity, Plausible
  });
  const page = await context.newPage();
  await page.goto(`${base}/services/`, { waitUntil: 'load' });
  return { page, sent, context };
}

/** gtag() of the inline GA snippet only queues into dataLayer (gtag.js is aborted) — read events from there. */
const events = (page) =>
  page.evaluate(() => (window.dataLayer || []).map((a) => Array.from(a)).filter((a) => a[0] === 'event').map((a) => ({ name: a[1], params: a[2] })));

async function fillForm(page, { name = 'Тест', contact = '@test_contact', message = 'Потрібен лендінг' } = {}) {
  await page.fill('#lf-name', name);
  await page.fill('#lf-contact', contact);
  await page.fill('#lf-message', message);
}

async function desktopChecks(browser, base) {
  // Happy path.
  const ok = await open(browser, base);
  check('H1 is visible', await ok.page.locator('h1').isVisible());
  check('FAQ answers are visible without interaction', await ok.page.locator('#faq .faq-item p').first().isVisible());
  await ok.page.click('a[data-cta="hero"]');
  const ctaEvent = (await events(ok.page)).find((e) => e.name === 'cta_click');
  check('hero CTA scrolls to the form and reports cta_click', ok.page.url().endsWith('#contact') && ctaEvent?.params?.event_label === 'hero', JSON.stringify(ctaEvent));
  await fillForm(ok.page);
  await ok.page.click('#leadForm button[type="submit"]');
  await ok.page.waitForFunction(() => document.getElementById('leadStatus').textContent.includes('Дякую'));
  const payload = ok.sent[0] ?? {};
  check('submits exactly one lead to the Worker', ok.sent.length === 1, `sent ${ok.sent.length}`);
  check('the lead carries the contact and the page', payload.contact === '@test_contact' && payload.source === '/services/' && payload.history?.startsWith('ФОРМА (/services/)'), JSON.stringify(payload));
  check('reports generate_lead after the Worker accepted it', (await events(ok.page)).some((e) => e.name === 'generate_lead'));
  check('hides the form and focuses the confirmation', await ok.page.evaluate(() => document.getElementById('leadForm').hidden && document.activeElement.id === 'leadStatus'));
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
  await bot.page.evaluate(() => { document.getElementById('lf-website').value = 'http://spam.example'; });
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
  check('on Worker error: no generate_lead', !(await events(fail.page)).some((e) => e.name === 'generate_lead'));
  await fail.context.close();
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
    await desktopChecks(browser, base);
    await mobileChecks(browser, base);
    const i = process.argv.indexOf('--screenshots');
    if (i !== -1) await screenshots(browser, base, process.argv[i + 1]);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(`smoke:services — ${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
