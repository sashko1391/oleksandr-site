// The comments block as it is served: every post loads the current versioned script, and the script
// is honest about what happened — a slashed API (no 308), a request that cannot hang forever, and a
// captcha that says so when a blocker kills it instead of asking the reader to pass a check that is not there.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const CURRENT = 'comments.v2.js';
const TAG = `<script src="/js/${CURRENT}" defer></script>`;

/** Every post the injector targets: public/{journal,blog}/<slug>/index.html. */
const posts = ['journal', 'blog'].flatMap((section) =>
  readdirSync(join(PUBLIC, section), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(PUBLIC, section, d.name, 'index.html')))
    .map((d) => ({ slug: `${section}/${d.name}`, html: readFileSync(join(PUBLIC, section, d.name, 'index.html'), 'utf8') }))
);
const js = () => readFileSync(join(PUBLIC, 'js', CURRENT), 'utf8');

describe('comments block', () => {
  it('sits on every post once, with the slug of that very page', () => {
    expect(posts.length).toBeGreaterThan(30);
    for (const { slug, html } of posts) {
      expect((html.match(/id="comments"/g) || []).length, slug).toBe(1);
      expect(html, slug).toContain(`<section id="comments" data-slug="${slug}"`);
    }
  });

  it('loads the current versioned script exactly once, and no page keeps an older one', () => {
    for (const { slug, html } of posts) {
      expect(html.split(TAG).length - 1, slug).toBe(1);
      expect(html, slug).not.toMatch(/\/js\/comments\.v1\.js/);
    }
    expect(existsSync(join(PUBLIC, 'js', 'comments.v1.js')), 'the old file must be gone').toBe(false);
    const injector = readFileSync(join(ROOT, 'scripts', 'inject-comments.mjs'), 'utf8');
    expect(injector, 'new posts must get the current version').toContain(`/js/${CURRENT}`);
  });

  it('is cached immutably under its own name, and the old rule is gone', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    const rule = vercel.headers.find((h) => h.source === `/js/${CURRENT}`);
    expect(rule?.headers?.[0]?.value).toContain('immutable');
    expect(vercel.headers.some((h) => h.source === '/js/comments.v1.js')).toBe(false);
  });

  it('calls the API with the trailing slash vercel.json enforces', () => {
    expect(js()).toContain("var API = '/api/comments/'");
    expect(js()).not.toMatch(/['"]\/api\/comments['"?]/);
  });

  it('cannot hang: the POST has a timeout and every path re-enables the button', () => {
    const src = js();
    expect(src).toContain('AbortController');
    expect(src).toMatch(/setTimeout\(function \(\) \{ ctrl\.abort\(\); \}, REQUEST_TIMEOUT\)/);
    expect(src).toContain('AbortError');
    expect(src).toMatch(/var done = function \(\) \{[\s\S]*?submit\.disabled = false;/);
    expect((src.match(/done\(\);/g) || []).length, 'both then and catch must call it').toBe(2);
  });

  it('says so when the captcha cannot load, and lifts the verdict when it recovers', () => {
    const src = js();
    expect(src).toContain('блокувальники');
    expect(src).toMatch(/s\.onerror = giveUp/);
    expect(src).toMatch(/setTimeout\(giveUp, CAPTCHA_TIMEOUT\)/);
    expect(src, 'an empty error-callback leaves the reader stuck').not.toMatch(/'error-callback': function \(\) \{\}/);
    expect(src).toMatch(/'error-callback': function \(\) \{ captchaDead = true;/);
    expect(src).toContain("'expired-callback'");
    // a token arriving after an error (Turnstile retries on its own) clears the verdict
    expect(src).toMatch(/callback: function \(\) \{ captchaDead = false;/);
    // and a dead captcha never sends a request it knows will fail
    const submit = src.split('function submitForm')[1].split('fetch(')[0];
    expect(submit).toMatch(/if \(captchaDead\)/);
  });

  it('never lets a captcha message overwrite a final «Дякую» (reset() re-runs the check after sending)', () => {
    const src = js();
    const guard = src.split('function captchaSay')[1].split('\n  }')[0];
    expect(guard, 'the guard must skip a status that already says ok').toMatch(/\.test\(statusNode\.className\)\) return;/);
    expect(src, 'every captcha message goes through the guard').not.toMatch(/setStatus\(statusNode, (CAPTCHA_MSG|EXPIRED_MSG)/);
  });

  it('tells an unregistered page apart from a broken one, and says what a 429 really means', () => {
    const src = js();
    const load = src.split('function loadComments')[1].split('function renderNotConnected')[0];
    expect(load).toMatch(/r\.status === 404\) return \{ notConnected: true \}/);
    const hide = src.split('function renderNotConnected')[1].split('\n  }')[0];
    expect(hide, 'a POST from an unregistered page would 404 too').toContain('form.hidden = true');
    const limited = src.split('r.status === 429')[1].split('} else')[0];
    expect(limited, 'the captcha-attempt limit answers 429 as well').toContain('Забагато спроб');
  });

  it('never blames the reader for our fault, and never pretends there are no comments when loading failed', () => {
    const src = js();
    const server = src.split('r.status >= 500')[1].split('} else')[0];
    expect(server).toContain('на нашому боці');
    expect(server).not.toMatch(/Перевірте поля/);
    expect(src).toContain('Не вдалося завантажити коментарі');
  });
});
