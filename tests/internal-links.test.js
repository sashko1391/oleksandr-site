// The indexing track: a page nobody links to from the text is a page Google has little reason to crawl.
// AGENTS.md, «Чек-лист нового поста» §5 — at least three incoming internal links — checked here.
import { describe, it, expect } from 'vitest';
import { loadSite, urlOf } from '../scripts/check-links.mjs';

const site = loadSite();
const indexable = site.pages.filter((p) => !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(p.html));

/** Links a reader could follow from the text: the injected menu, the footer and breadcrumbs do not count. */
function editorialLinks(html) {
  const body = html
    .replace(/<!-- nav:start -->[\s\S]*?<!-- nav:end -->/g, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/g, ' ')
    .replace(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/g, ' ');
  return [...body.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1].replace('https://www.parkinsandr.tech', '').split('#')[0])
    .filter((href) => href.startsWith('/'));
}

const incoming = new Map(indexable.map((p) => [urlOf(p.rel), new Set()]));
for (const page of indexable) {
  for (const href of editorialLinks(page.html)) {
    const target = incoming.get(href);
    if (target && href !== urlOf(page.rel)) target.add(urlOf(page.rel));
  }
}

/** Pages that live by other rules, each for a reason that has to stay true. */
const EXCEPTIONS = {
  '/blog/': 'the archive is deliberately out of the menu; /code/ and /services/ link it',
  '/privacy/': 'a legal page: the footer links it from every page',
};

describe('internal linking', () => {
  it('every content page has at least three editorial sources', () => {
    const thin = [...incoming]
      .filter(([url, from]) => from.size < 3 && !(url in EXCEPTIONS))
      .map(([url, from]) => `${url} (${from.size})`);
    expect(thin, 'these pages depend on the menu alone').toEqual([]);
  });

  it('the exceptions are still linked the way they are supposed to be', () => {
    expect(incoming.get('/blog/')).toEqual(new Set(['/code/', '/services/']));
    expect([...incoming.get('/privacy/')].length, 'at least the services page links it in text')
      .toBeGreaterThanOrEqual(1);
    for (const url of Object.keys(EXCEPTIONS)) expect(incoming.has(url), `${url} disappeared`).toBe(true);
  });

  it('each hub is linked from the text, not only from the menu', () => {
    for (const hub of ['/journal/', '/code/', '/creative/', '/parkinson/']) {
      expect(incoming.get(hub).size, `${hub} is menu-only`).toBeGreaterThanOrEqual(3);
    }
  });

  it('no page links only to itself or to nothing', () => {
    for (const page of indexable) {
      const links = new Set(editorialLinks(page.html).filter((h) => h !== urlOf(page.rel)));
      expect(links.size, `${page.rel} has no outgoing editorial links`).toBeGreaterThan(0);
    }
  });
});
