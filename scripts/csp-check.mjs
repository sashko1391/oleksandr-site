#!/usr/bin/env node
// Browser check of the site-wide Content-Security-Policy: opens every page of the sitemap (plus a real 404),
// triggers what loads late — the comments and subscription blocks with their Turnstile, the YouTube facade,
// a lead form — and fails on any CSP violation or on a header the browser reports as broken.
//
//   npm run check:csp                      # production, with the headers it actually serves
//   npm run check:csp -- --local           # public/ served locally with the headers of vercel.json's first rule
//   npm run check:csp -- --base <url>      # any other deployment
//   npm run check:csp -- --only /services/ # one page (any of the above), for debugging
//
// Third-party scripts and the Turnstile widget load for real, because that is what the policy has to allow. What
// would leave a trace is answered here instead, after the browser has already checked it against the policy:
// analytics beacons (GA with Google Signals on any google.<tld>, Clarity, Plausible), the lead Worker, the YouTube
// player behind the facade, and media bytes. The run ends with the list of third-party requests that did reach the
// network — only scripts and the captcha belong there. Every page must also prove that its integrations ran
// (GA, Clarity, Plausible; Turnstile, YouTube, the lead form where the page has them): a silent miss is a failure.
// Playwright + system Chrome, like smoke:forms; not part of `npm test`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PROD = 'https://www.parkinsandr.tech';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

/**
 * What a request would leave behind if it reached the network: a 'beacon' (an analytics hit or a lead), the
 * 'player' (YouTube inside the facade), or null — a script or the captcha, which may load for real.
 * Everything non-null is answered locally; by then the browser has already checked it against the policy.
 */
export function stubKind(url, base) {
  const u = new URL(url);
  const host = u.hostname;
  if (u.origin === new URL(base).origin && (u.pathname.startsWith('/api/event') || u.pathname.startsWith('/api/lead'))) return 'beacon';
  if (/(^|\.)(google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/.test(host)) return 'beacon';
  if (/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return 'beacon'; // Google Signals on any country domain
  if (host === 'c.bing.com') return 'beacon';
  // Clarity: only the tag and the recorder script are code; every other *.clarity.ms request (uploads, the c.gif
  // cookie sync) is a hit.
  if (host.endsWith('.clarity.ms') && host !== 'www.clarity.ms' && host !== 'scripts.clarity.ms') return 'beacon';
  if (host.endsWith('.workers.dev')) return 'beacon'; // the lead Worker: no real lead from a check
  if (host === 'www.youtube-nocookie.com' || host === 'www.youtube.com') return 'player';
  return null;
}

/** Console lines that mean a header is broken — they come from the browser, not from a script. */
export const BROKEN_HEADER = /Permissions-Policy|is ignored when delivered in a report-only policy|Unrecognized Content-Security-Policy directive|Content.Security.Policy.*(invalid|not supported)/i;

/**
 * The local site answers as http://csp-check.test:<port>, which Chrome maps to 127.0.0.1: Plausible ignores
 * localhost and 127.x outright, and a run that cannot make it send proves nothing about its connect-src.
 */
const LOCAL_HOST = 'csp-check.test';

/** public/ over HTTP with the security headers of vercel.json's first rule — a deploy preview without a deploy. */
function serveLocal() {
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const rule = vercel.headers[0];
  const headers = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
  let plausible = null; // vercel.json rewrites /js/script.js to Plausible; do the same, fetched once
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.startsWith('/api/')) return res.writeHead(404, { 'Content-Type': 'application/json' }).end('{}');
    if (path === '/js/script.js') {
      plausible ??= fetch('https://plausible.io/js/script.js').then((r) => (r.ok ? r.text() : Promise.reject(new Error(`plausible ${r.status}`))));
      const body = await plausible.catch(() => null);
      if (!body) return res.writeHead(502).end();
      return res.writeHead(200, { 'Content-Type': 'application/javascript', ...headers }).end(body);
    }
    let file = normalize(join(PUBLIC, path));
    if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return res.writeHead(403).end();
    if (path.endsWith('/')) file = join(file, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers }).end(body);
    } catch {
      const body = await readFile(join(PUBLIC, '404.html'));
      res.writeHead(404, { 'Content-Type': TYPES['.html'], ...headers }).end(body);
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Every page to open: the sitemap, mapped onto the base, plus an address that does not exist. */
function pagesFor(base) {
  const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');
  const paths = [...sitemap.matchAll(/<loc>https:\/\/www\.parkinsandr\.tech([^<]*)<\/loc>/g)].map((m) => m[1]);
  return [...paths, '/csp-check-no-such-page/'].map((p) => base + p);
}

/**
 * What loads only after a scroll or a click. Returns what the page has and what actually happened, so a widget
 * that never appeared is reported instead of passing quietly.
 */
async function exercise(page, seen) {
  const expected = {};
  // By the frame list, not a CSS selector: Turnstile puts its iframe where selectors do not reach.
  const frameAppears = async (prefix, ms = 8000) => {
    for (const end = Date.now() + ms; Date.now() < end; await page.waitForTimeout(200)) {
      if (page.frames().some((f) => f.url().startsWith(prefix))) return true;
    }
    return false;
  };
  for (const block of ['#comments', '[data-subscribe]']) {
    if (await page.locator(block).count()) {
      expected.turnstile = true;
      await page.locator(block).first().scrollIntoViewIfNeeded();
      if (await frameAppears('https://challenges.cloudflare.com/')) seen.add('turnstile');
    }
  }
  if (await page.locator('.video-facade').count()) {
    expected.youtube = true;
    await page.locator('.video-facade').first().click();
    if (await frameAppears('https://www.youtube-nocookie.com/embed/')) seen.add('youtube');
  }
  const lead = page.locator('form[data-lead-form]').first();
  if (await lead.count() && await lead.isVisible()) {
    expected.lead = true;
    for (const field of await lead.locator('input[required]:not([type=radio]):not([type=checkbox]), textarea[required]').all()) {
      await field.fill('csp-check').catch(() => {});
    }
    for (const group of await lead.locator('input[type=radio][required]').all()) await group.check().catch(() => {});
    await lead.locator('button[type="submit"]').click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500); // late beacons: Clarity uploads, GA engagement
  return expected;
}

/** Proof that an integration ran, from the requests the page made. */
function markSeen(seen, url, method, base) {
  const u = new URL(url);
  if (u.hostname === 'www.googletagmanager.com' && u.pathname.startsWith('/gtag/js')) seen.add('ga');
  if (u.hostname === 'www.clarity.ms' && u.pathname.startsWith('/tag/')) seen.add('clarity');
  if (u.origin === base && u.pathname.startsWith('/api/event') && method === 'POST') seen.add('plausible');
  if ((u.hostname.endsWith('.workers.dev') || (u.origin === base && u.pathname.startsWith('/api/lead'))) && method === 'POST') seen.add('lead');
}

const WORKERS = 4; // pages checked in parallel
const PAGES_PER_BROWSER = 8; // a fresh browser after this many: one process over dozens of heavy pages crashes

/** Open one page under the policy, exercise it, and report what the browser objected to. */
async function checkPage(browser, url, base, local, traffic) {
  const path = url.slice(base.length) || '/';
  const problems = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await context.addInitScript(() => {
      if (window.top !== window) return; // a third-party frame answers to its own policy
      // Plausible stays silent under automation (navigator.webdriver) unless this is set — its own switch for tests.
      window.__plausible = true;
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__csp.push({ directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, disposition: e.disposition });
      });
    });
    const count = (map, host) => map.set(host, (map.get(host) ?? 0) + 1);
    await context.route('**/*', (route) => {
      const request = route.request();
      const u = new URL(request.url());
      const third = u.origin !== base;
      const kind = stubKind(request.url(), base);
      if (kind === 'beacon' || request.resourceType() === 'media') { // media: passed the policy; bytes only weigh on Chrome
        if (third) count(traffic.stubbed, u.hostname);
        return route.fulfill({ status: 204, body: '' });
      }
      if (kind === 'player') { // the facade's iframe has passed frame-src; its player would phone home
        count(traffic.stubbed, u.hostname);
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player stub</title>' });
      }
      // Locally there are no functions: answer the comments list the way production does, so the form
      // (and its Turnstile) renders instead of hiding as «not connected».
      if (local && !third && u.pathname === '/api/comments/' && request.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"comments":[]}' });
      }
      if (third) count(traffic.network, u.hostname);
      return route.continue();
    });
    const page = await context.newPage();
    let crashed = false;
    page.on('crash', () => { crashed = true; });
    const seen = new Set();
    page.on('request', (req) => markSeen(seen, req.url(), req.method(), base));
    const consoleLines = [];
    page.on('console', (msg) => { if (BROKEN_HEADER.test(msg.text())) consoleLines.push(msg.text()); });
    const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch((e) => ({ error: e }));
    if (response?.error) return { path, problems: [`${path}: did not load (${response.error.message.split('\n')[0]})`], header: null };
    const h = await response.allHeaders();
    const header = h['content-security-policy'] ? 'Content-Security-Policy'
      : h['content-security-policy-report-only'] ? 'Content-Security-Policy-Report-Only' : 'none';
    // What the page carries decides what must have run: the snippets in its markup, the widgets it shows.
    const expected = await page.evaluate(() => ({
      ga: !!document.querySelector('script[src*="googletagmanager.com/gtag/js"]'),
      clarity: [...document.scripts].some((s) => !s.src && s.textContent.includes('clarity.ms/tag/')),
      plausible: !!document.querySelector('script[data-api]'),
    }));
    // a page that dies mid-check is a finding of its own, not a reason to stop checking the rest
    const failed = await exercise(page, seen).then((more) => { Object.assign(expected, more); return null; },
      (e) => e.message.split('\n')[0]);
    if (failed) problems.push(`${path}: the check could not finish (${crashed ? 'renderer crashed' : failed})`);
    else for (const [name, wanted] of Object.entries(expected)) {
      if (wanted && !seen.has(name)) problems.push(`${path}: ${name} never ran — the check proves nothing about it here`);
    }
    const violations = page.isClosed() ? [] : await page.evaluate(() => window.__csp || []).catch(() => []);
    for (const v of violations) problems.push(`${path}: ${v.directive} blocked ${v.blocked || '(inline)'}${v.source ? ` from ${v.source}:${v.line}` : ''} [${v.disposition}]`);
    for (const line of consoleLines) problems.push(`${path}: console — ${line}`);
    return { path, problems, header };
  } finally {
    await context.close().catch(() => {});
  }
}

async function main(argv) {
  const local = argv.includes('--local');
  const at = argv.indexOf('--base');
  let server = null;
  let base = at !== -1 ? argv[at + 1].replace(/\/$/, '') : PROD;
  if (local) {
    server = await serveLocal();
    base = `http://${LOCAL_HOST}:${server.address().port}`;
  }
  const only = argv.indexOf('--only');
  const queue = only === -1 ? pagesFor(base) : [base + argv[only + 1]];
  const total = queue.length;
  const problems = [];
  const headers = new Set();
  const traffic = { network: new Map(), stubbed: new Map() }; // third-party host → requests
  const launch = () => chromium.launch({
    headless: true,
    channel: 'chrome',
    args: local ? [`--host-resolver-rules=MAP ${LOCAL_HOST} 127.0.0.1`] : [],
  });

  async function worker() {
    let browser = null;
    let used = 0;
    try {
      while (queue.length) {
        const url = queue.shift();
        if (!browser || !browser.isConnected() || used >= PAGES_PER_BROWSER) {
          await browser?.close().catch(() => {});
          browser = await launch();
          used = 0;
        }
        used++;
        const result = await checkPage(browser, url, base, local, traffic);
        if (result.header) headers.add(result.header);
        problems.push(...result.problems);
        console.log(`${result.problems.length ? '✗' : '✓'} ${result.path}${result.problems.length ? '\n    ' + result.problems.join('\n    ') : ''}`);
      }
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(WORKERS, total) }, worker));
  } finally {
    if (server) server.close();
  }
  const unique = [...new Set(problems)];
  const table = (title, map) => {
    console.log(`\n${title}`);
    for (const [host, n] of [...map].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${host}`);
  };
  table('third-party requests that reached the network (scripts and the captcha only):', traffic.network);
  table('answered locally after the policy check (beacons, the player, media):', traffic.stubbed);
  const header = [...headers].join(', ') || 'none';
  console.log(`\ncheck:csp — ${base} — ${total} page(s) — header: ${header}`);
  if (headers.has('none') || !headers.size) unique.push('a page was served without any Content-Security-Policy header');
  for (const p of unique) console.log(`  ${p}`);
  console.log(unique.length ? `${unique.length} problem(s)` : 'no violations');
  process.exitCode = unique.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
