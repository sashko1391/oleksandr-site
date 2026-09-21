// Static policy checks that enforce the rules tagged `[enforced: tests/policy.test.js]` in AGENTS.md.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { maskInert } from '../scripts/inject-rss.mjs';

const PUBLIC = join(process.cwd(), 'public');
const SITE = 'https://www.parkinsandr.tech';
const LADOMYR_ID = 'https://www.ladomyr.kiev.ua/#business';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = htmlFiles(PUBLIC).map((file) => ({
  rel: relative(PUBLIC, file).split(sep).join('/'),
  html: readFileSync(file, 'utf8'),
}));
const indexable = pages.filter(
  (p) => !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(p.html)
);

/** 'journal/x/index.html' → '/journal/x/', 'index.html' → '/' */
const urlOf = (rel) => '/' + rel.replace(/index\.html$/, '');

/** Every "@id" string inside the page's JSON-LD blocks (parsed, not regexed). */
function ldIds(html) {
  const ids = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      if (typeof n['@id'] === 'string') ids.push(n['@id']);
      Object.values(n).forEach(walk);
    }
  };
  const re = /<script\b[^>]*\btype\s*=\s*['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) walk(JSON.parse(m[1]));
  return ids;
}

describe('policy: fonts', () => {
  it('no <link rel="preload" as="font"> on any page', () => {
    const bad = pages.filter((p) => /<link\b[^>]*\bas\s*=\s*["']font["']/i.test(p.html)).map((p) => p.rel);
    expect(bad).toEqual([]);
  });
});

describe('policy: stable @id', () => {
  const all = indexable.flatMap((p) => ldIds(p.html).map((id) => ({ rel: p.rel, id })));

  it('legacy Person @id /#author is not used anywhere', () => {
    expect(all.filter((x) => x.id === `${SITE}/#author`)).toEqual([]);
  });
  it('Person entity is defined on /pro-mene/', () => {
    const page = indexable.find((p) => p.rel === 'pro-mene/index.html');
    expect(ldIds(page.html)).toContain(`${SITE}/pro-mene/#author`);
  });
  it('every #business @id is either ours or the Ladomyr client entity', () => {
    const allowed = new Set([`${SITE}/#business`, LADOMYR_ID]);
    expect(all.filter((x) => x.id.endsWith('#business') && !allowed.has(x.id))).toEqual([]);
  });
  it('the Ladomyr client entity @id stays exactly as is: twice, only in its case', () => {
    expect(all.filter((x) => x.id === LADOMYR_ID).map((x) => x.rel)).toEqual([
      'projects/ladomyr/index.html',
      'projects/ladomyr/index.html',
    ]);
  });
});

describe('policy: discovery', () => {
  const locs = [...readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('sitemap has no duplicate URLs', () => {
    expect(locs.length).toBe(new Set(locs).size);
  });
  it('sitemap lists exactly the indexable pages', () => {
    expect(new Set(locs)).toEqual(new Set(indexable.map((p) => SITE + urlOf(p.rel))));
  });
  it('every indexable page links /feed.xml exactly once in <head>, as a real rss alternate', () => {
    const bad = indexable
      .filter((p) => {
        // commented-out and script-embedded markup is not a link
        const head = (maskInert(p.html).match(/<head[\s>][\s\S]*?<\/head>/i) || [''])[0];
        const rss = (head.match(/<link\b[^>]*>/gi) || []).filter(
          (t) =>
            /\brel\s*=\s*["']alternate["']/i.test(t) &&
            /\btype\s*=\s*["']application\/rss\+xml["']/i.test(t) &&
            /\bhref\s*=\s*["']\/feed\.xml["']/i.test(t)
        );
        return rss.length !== 1;
      })
      .map((p) => p.rel);
    expect(bad).toEqual([]);
  });
});
