// The subscription block as it is served: the markup must not promise anything that cannot work
// without JavaScript, and every field the handler validates must exist on the page.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOPICS } from '../lib/schema.js';
import { FEEDS } from '../scripts/build-feed.mjs';
import { maskInert } from '../scripts/inject-rss.mjs';

const PUBLIC = join(process.cwd(), 'public');
const read = (rel) => readFileSync(join(PUBLIC, rel), 'utf8');
const HUBS = FEEDS.slice(1).map((f) => ({
  rel: f.file.replace('feed.xml', 'index.html'),
  topic: f.file.replace('/feed.xml', ''),
  feed: `/${f.file}`,
}));

describe('subscription block', () => {
  it('sits on every section hub, exactly once', () => {
    for (const { rel } of HUBS) {
      const html = maskInert(read(rel));
      expect((html.match(/data-subscribe/g) || []).length, rel).toBe(1);
      expect((html.match(/<form class="sub-form"/g) || []).length, rel).toBe(1);
    }
  });

  it('is hidden until the script runs — a form that cannot submit is never shown', () => {
    for (const { rel } of HUBS) {
      expect(read(rel), rel).toContain('<form class="sub-form" hidden');
    }
  });

  it('always shows the ways to subscribe that need no JavaScript at all', () => {
    for (const { rel, feed } of HUBS) {
      const block = read(rel).split('data-subscribe')[1].split('</section>')[0];
      expect(block, `${rel}: the feed link must stay outside the hidden form`).toContain(`href="${feed}"`);
      expect(block, `${rel}: and so must the channel`).toContain('https://t.me/parkinsandr');
      // both live outside the form, so hiding the form cannot hide them
      const form = block.split('<form class="sub-form" hidden')[1].split('</form>')[0];
      expect(form).not.toContain(feed);
      expect(form).not.toContain('t.me/parkinsandr');
    }
  });

  it('offers only the topics the API accepts, with this section pre-checked', () => {
    for (const { rel, topic } of HUBS) {
      const form = read(rel).split('<form class="sub-form"')[1].split('</form>')[0];
      const values = [...form.matchAll(/name="topics" value="([^"]+)"/g)].map((m) => m[1]);
      expect(values.sort(), rel).toEqual([...TOPICS].sort());
      const own = form.match(new RegExp(`name="topics" value="${topic}"[^>]*>`))[0];
      expect(own, `${rel}: its own section must be ticked`).toContain('checked');
      const checked = [...form.matchAll(/name="topics" value="([^"]+)" checked/g)].map((m) => m[1]);
      expect(checked, `${rel}: nothing else may be ticked for the reader`).toEqual([topic]);
    }
  });

  it('asks for consent with a link to the privacy page, and carries a honeypot', () => {
    for (const { rel } of HUBS) {
      const form = read(rel).split('<form class="sub-form"')[1].split('</form>')[0];
      expect(form, rel).toMatch(/name="consent"[^>]*required/);
      expect(form, `${rel}: consent must link the privacy policy`).toContain('href="/privacy/"');
      expect(form, rel).toMatch(/name="hp"[^>]*class="sub-hp"/);
      expect(form, `${rel}: the honeypot must be out of the tab order`).toMatch(/name="hp"[^>]*tabindex="-1"/);
      expect(form, rel).toContain('data-turnstile');
      expect(form, rel).toContain('data-status');
    }
  });

  it('loads the versioned script, which vercel.json caches immutably', () => {
    for (const { rel } of HUBS) {
      expect(read(rel), rel).toContain('<script defer src="/js/subscribe.v1.js"></script>');
    }
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    const rule = vercel.headers.find((h) => h.source === '/js/subscribe.v1.js');
    expect(rule?.headers?.[0]?.value).toContain('immutable');
  });

  it('keeps the tap targets at 48px', () => {
    for (const { rel } of HUBS) {
      const css = read(rel).match(/<style>([\s\S]*?)<\/style>/)[1];
      for (const rule of ['.sub-field input[type=email]', '.sub-topics label', '.sub-submit']) {
        const found = css.match(new RegExp(`${rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`));
        expect(found?.[0], `${rel}: ${rule}`).toMatch(/min-height: 48px/);
      }
    }
  });

  it('calls the API with the trailing slash vercel.json enforces (no 308 on every submit)', () => {
    const js = readFileSync(join(PUBLIC, 'js', 'subscribe.v1.js'), 'utf8');
    expect(js).toContain("fetch('/api/subscribe/'");
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(vercel.trailingSlash, 'this test exists because of that setting').toBe(true);
    // the links people open from an email must not redirect either — a one-click POST may not follow
    for (const [file, needle] of [
      ['api/subscribe.js', '/api/subscribe/confirm/?token='],
      ['api/subscribe/confirm.js', "const ACTION = '/api/subscribe/confirm/'"],
      ['api/unsubscribe.js', "const ACTION = '/api/unsubscribe/'"],
    ]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).toContain(needle);
    }
  });

  it('never claims a letter was sent when the request failed, and never blames the address for our fault', () => {
    const js = readFileSync(join(PUBLIC, 'js', 'subscribe.v1.js'), 'utf8');
    // every 5xx is ours — a missing key or a dead provider is not the reader's typo
    const failure = js.split('r.status >= 500')[1].split('} else')[0];
    expect(failure).not.toMatch(/Перевірте пошту/);
    expect(failure).not.toMatch(/Перевірте адресу/);
    expect(failure).toContain('не вдалося');
    expect(failure).toContain('на нашому боці');
    // and a captcha that never loads says so instead of spinning forever
    expect(js).toContain('captchaDead');
    expect(js).toMatch(/s\.onerror = giveUp/);
    expect(js).toMatch(/setTimeout\(giveUp/);
  });
});
