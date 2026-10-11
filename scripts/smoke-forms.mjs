#!/usr/bin/env node
// Browser smoke for every lead form on the site (/services/, five landings, the /pricing/ brief) plus the
// /services/ page specifics: CTA tracking, honeypot, timeout and mobile a11y — and the comments form on a post
// (comments.v2.js: slashed API, request timeout, honest Turnstile failure and recovery).
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

const COMMENTS_POST = '/blog/yak-obrati-rozrobnyka/';
const COMMENTS_SLUG = 'blog/yak-obrati-rozrobnyka';

/**
 * Turnstile stand-in. `ok` hands out a token right after render; `error` fires the error callback first, and the
 * check then calls window.__ts.give(token) the way the real widget does when its own retry succeeds.
 */
const turnstileStub = (mode) => `(function () {
  var n = 0, opts = {};
  window.__ts = {
    resets: 0, token: '',
    give: function (t) { window.__ts.token = t; if (opts.callback) opts.callback(t); },
    fail: function () { if (opts['error-callback']) opts['error-callback'](); },
    expire: function () { window.__ts.token = ''; if (opts['expired-callback']) opts['expired-callback'](); }
  };
  window.turnstile = {
    render: function (el, o) {
      opts = o; n++;
      Promise.resolve().then(function () {
        ${mode === 'error' ? "if (opts['error-callback']) opts['error-callback']();" : "window.__ts.give('stub-token');"}
      });
      return 'w' + n;
    },
    getResponse: function () { return window.__ts.token; },
    reset: function () {
      window.__ts.resets++; window.__ts.token = '';
      Promise.resolve().then(function () { window.__ts.give('stub-token-after-reset'); });
    },
    remove: function () {}
  };
})();`;

/**
 * Open a post with the comments API stubbed (GET list, POST answer) and Turnstile replaced or blocked.
 * `turnstileGate`: a promise the Turnstile script waits for (a script that arrives late); `clock`: fake timers from
 * before the block initialises, so its 8-second captcha timeout can be fast-forwarded.
 */
async function openComments(browser, base, { turnstile = 'ok', postStatus = 202, postHangs = false, getStatus = 200, turnstileGate = null, clock = false } = {}) {
  const context = await browser.newContext({ viewport: DESKTOP });
  const calls = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base && url.pathname.startsWith('/api/comments')) {
      const post = request.method() === 'POST';
      calls.push({ method: request.method(), path: url.pathname, search: url.search, headers: request.headers(), body: post ? request.postDataJSON() : null });
      if (!post) return route.fulfill({ status: getStatus, contentType: 'application/json', body: JSON.stringify({ comments: [] }) });
      if (postHangs) return undefined; // never answer: the page has to give up on its own
      return route.fulfill({ status: postStatus, contentType: 'application/json', body: '{}' });
    }
    if (request.url().startsWith(base)) return route.continue();
    if (url.hostname === 'challenges.cloudflare.com' && url.pathname.startsWith('/turnstile/')) {
      if (turnstile === 'blocked') return route.abort(); // an ad blocker, as the reader sees it
      const answer = () => route.fulfill({ status: 200, contentType: 'text/javascript', body: turnstileStub(turnstile) });
      return turnstileGate ? turnstileGate.then(answer) : answer();
    }
    return route.abort(); // GA, Clarity, Plausible
  });
  const page = await context.newPage();
  await page.goto(base + COMMENTS_POST, { waitUntil: 'load' });
  if (clock) await page.clock.install();
  await page.locator('#comments').scrollIntoViewIfNeeded(); // the block initialises lazily
  await page.locator('.cmt-form').waitFor({ state: 'attached', timeout: 10000 });
  return { page, calls, context };
}

const commentStatus = (page) => page.evaluate(() => document.getElementById('cmt-status').textContent);
const waitStatus = (page, text) =>
  page.waitForFunction((t) => document.getElementById('cmt-status').textContent.includes(t), text, { timeout: 10000 })
    .then(() => true, () => false);

async function fillComment(page) {
  await page.fill('#cmt-name', 'Тест');
  await page.fill('#cmt-body', 'Smoke-коментар');
  await page.check('#cmt-consent');
}

/** comments.v2.js: what the reader sees in each outcome, and what actually goes over the wire. */
async function commentsChecks(browser, base) {
  // Happy path: slashed GET and POST, the token travels, and the fresh token after reset() keeps «Дякую».
  const ok = await openComments(browser, base);
  await ok.page.waitForFunction(() => window.__ts && window.__ts.token === 'stub-token');
  await fillComment(ok.page);
  await ok.page.click('.cmt-submit');
  const thanked = await waitStatus(ok.page, 'Дякую');
  await ok.page.waitForFunction(() => window.__ts.resets > 0 && window.__ts.token === 'stub-token-after-reset');
  const get = ok.calls.find((c) => c.method === 'GET');
  const post = ok.calls.find((c) => c.method === 'POST');
  check('comments: the list and the submit both call /api/comments/ with the slash (no 308)',
    get?.path === '/api/comments/' && get?.search === `?slug=${encodeURIComponent(COMMENTS_SLUG)}` && post?.path === '/api/comments/',
    JSON.stringify({ get: get && get.path + get.search, post: post?.path }));
  check('comments: the POST carries the slug, the Turnstile token and the CSRF marker',
    post?.body?.slug === COMMENTS_SLUG && post?.body?.turnstileToken === 'stub-token' && post?.headers['x-requested-with'] === 'fetch',
    JSON.stringify(post?.body));
  check('comments: «Дякую» survives the fresh token that reset() brings',
    thanked && (await commentStatus(ok.page)).includes('Дякую'), await commentStatus(ok.page));
  // the re-run after reset() errors, or its token expires five minutes later: still «Дякую», never «не пішов»
  await ok.page.evaluate(() => { window.__ts.fail(); window.__ts.expire(); });
  const afterNoise = await commentStatus(ok.page);
  check('comments: a captcha error or expiry after the comment was sent does not overwrite «Дякую»',
    afterNoise.includes('Дякую'), afterNoise);
  await ok.context.close();

  // An expired token before submit: the reader is told, the widget is re-run, and the fresh token clears it.
  const stale = await openComments(browser, base);
  await stale.page.waitForFunction(() => window.__ts && window.__ts.token === 'stub-token');
  await stale.page.evaluate(() => window.__ts.expire());
  await stale.page.waitForFunction(() => window.__ts.token === 'stub-token-after-reset');
  const staleState = await stale.page.evaluate(() => ({ resets: window.__ts.resets, text: document.getElementById('cmt-status').textContent }));
  check('comments: an expired check is re-run, and the fresh token clears the warning',
    staleState.resets === 1 && staleState.text === '', JSON.stringify(staleState));
  await stale.context.close();

  // Turnstile loads but never renders (8 s), then arrives late: the verdict comes, then it is lifted.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const late = await openComments(browser, base, { turnstileGate: gate, clock: true });
  const beforeTimeout = await commentStatus(late.page);
  await late.page.clock.fastForward(9000);
  let toldLate = false;
  for (let i = 0; i < 50 && !toldLate; i++) { // poll with Node timers: the page's timers are fake now
    toldLate = (await commentStatus(late.page)).includes('блокувальники');
    if (!toldLate) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  release();
  await late.page.waitForFunction(() => window.__ts && window.__ts.token === 'stub-token', null, { timeout: 10000 });
  const lifted = (await commentStatus(late.page)) === '';
  check('comments: no captcha after 8 s says so; a late arrival lifts the verdict',
    beforeTimeout === '' && toldLate && lifted, `before="${beforeTimeout}" told=${toldLate} lifted=${lifted}`);
  await late.context.close();

  // Every refusal the API can give: a true sentence, the text kept, a live button.
  for (const [code, text] of [[400, 'Перевірка не пройшла'], [404, 'не підключені'], [429, 'Забагато спроб'], [502, 'не вдалося підтвердити']]) {
    const refused = await openComments(browser, base, { postStatus: code });
    await refused.page.waitForFunction(() => window.__ts && window.__ts.token === 'stub-token');
    await fillComment(refused.page);
    await refused.page.click('.cmt-submit');
    const said = await waitStatus(refused.page, text);
    const state = await refused.page.evaluate(() => ({
      body: document.getElementById('cmt-body').value, disabled: document.querySelector('.cmt-submit').disabled,
    }));
    check(`comments: ${code} — says «${text}…», keeps the text, the button stays live`,
      said && state.body === 'Smoke-коментар' && !state.disabled, JSON.stringify({ said, ...state, status: await commentStatus(refused.page) }));
    await refused.context.close();
  }

  // Turnstile blocked: the reader is told why, and no request that is bound to fail goes out.
  const blocked = await openComments(browser, base, { turnstile: 'blocked' });
  const toldBlocked = await waitStatus(blocked.page, 'блокувальники');
  await fillComment(blocked.page);
  await blocked.page.click('.cmt-submit');
  const blockedState = await blocked.page.evaluate(() => ({
    text: document.getElementById('cmt-status').textContent, disabled: document.querySelector('.cmt-submit').disabled,
  }));
  check('comments: a blocked Turnstile says so and sends nothing',
    toldBlocked && blockedState.text.includes('блокувальники') && !blockedState.disabled &&
      !blocked.calls.some((c) => c.method === 'POST'),
    JSON.stringify({ toldBlocked, ...blockedState, posts: blocked.calls.filter((c) => c.method === 'POST').length }));
  await blocked.context.close();

  // Turnstile errors, then its own retry succeeds: the verdict is lifted and the comment goes through.
  const flaky = await openComments(browser, base, { turnstile: 'error' });
  const toldError = await waitStatus(flaky.page, 'блокувальники');
  await flaky.page.evaluate(() => window.__ts.give('recovered-token'));
  const cleared = (await commentStatus(flaky.page)) === '';
  await fillComment(flaky.page);
  await flaky.page.click('.cmt-submit');
  const recovered = await waitStatus(flaky.page, 'Дякую');
  const flakyPost = flaky.calls.find((c) => c.method === 'POST');
  check('comments: after a Turnstile error and a successful retry the comment is sent',
    toldError && cleared && recovered && flakyPost?.body?.turnstileToken === 'recovered-token',
    JSON.stringify({ toldError, cleared, recovered, token: flakyPost?.body?.turnstileToken }));
  await flaky.context.close();

  // Our 5xx: the reader is not told to check the fields, and the text stays in the form.
  const down = await openComments(browser, base, { postStatus: 503 });
  await down.page.waitForFunction(() => window.__ts && window.__ts.token === 'stub-token');
  await fillComment(down.page);
  await down.page.click('.cmt-submit');
  const blamedUs = await waitStatus(down.page, 'на нашому боці');
  const kept = await down.page.evaluate(() => ({
    body: document.getElementById('cmt-body').value, disabled: document.querySelector('.cmt-submit').disabled,
  }));
  check('comments: on 503 says it is our fault and keeps the text',
    blamedUs && kept.body === 'Smoke-коментар' && !kept.disabled, JSON.stringify(kept));
  await down.context.close();

  // The POST never answers: no endless «Надсилаю…» — the timeout ends in an honest message and a live button.
  const hang = await openComments(browser, base, { postHangs: true });
  await hang.page.waitForFunction(() => window.__ts && window.__ts.token === 'stub-token');
  await hang.page.clock.install(); // after init: only the request timer needs to be fake
  await fillComment(hang.page);
  await hang.page.click('.cmt-submit');
  const waiting = (await commentStatus(hang.page)) === 'Надсилаю…' &&
    (await hang.page.evaluate(() => document.querySelector('.cmt-submit').disabled));
  await hang.page.clock.fastForward(16000);
  let gaveUp = false;
  for (let i = 0; i < 50 && !gaveUp; i++) { // poll with Node timers: the page's timers are fake now
    gaveUp = (await commentStatus(hang.page)).includes('не відповів вчасно');
    if (!gaveUp) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const alive = !(await hang.page.evaluate(() => document.querySelector('.cmt-submit').disabled));
  check('comments: a POST that never answers gives up after the timeout with a live button',
    waiting && gaveUp && alive, `waiting=${waiting} gaveUp=${gaveUp} alive=${alive}`);
  await hang.context.close();

  // The list cannot load: say so instead of «Ще немає коментарів», and keep the form.
  const noList = await openComments(browser, base, { getStatus: 503 });
  await noList.page.waitForFunction(() => document.getElementById('cmt-listwrap').textContent.length > 0);
  const listText = await noList.page.evaluate(() => document.getElementById('cmt-listwrap').textContent);
  check('comments: a failed list load is not passed off as «no comments yet»',
    listText.includes('Не вдалося завантажити') && !listText.includes('Ще немає') && (await noList.page.locator('.cmt-form').isVisible()),
    listText);
  await noList.context.close();

  // The page is not registered in `posts` (GET 404): say so and hide a form whose POST would 404 too.
  const unregistered = await openComments(browser, base, { getStatus: 404 });
  await unregistered.page.waitForFunction(() => document.getElementById('cmt-listwrap').textContent.length > 0);
  const unregText = await unregistered.page.evaluate(() => document.getElementById('cmt-listwrap').textContent);
  const formShown = await unregistered.page.locator('.cmt-form').isVisible();
  check('comments: an unregistered page says comments are not connected and hides the form',
    unregText.includes('не підключені') && !formShown, JSON.stringify({ unregText, formShown }));
  await unregistered.context.close();
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
    await commentsChecks(browser, base);
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
