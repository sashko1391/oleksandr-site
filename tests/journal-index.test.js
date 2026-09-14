import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// /journal/ is hand-maintained static HTML. These checks keep it a single
// reverse-chronological feed whose dates come from each post's own Article JSON-LD.

const ROOT = join(import.meta.dirname, '..', 'public', 'journal');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');
const GENRES = ['podorozh', 'eseyi', 'opovidannya', 'shchodennyk'];
const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

function postDate(slug) {
  const html = readFileSync(join(ROOT, slug, 'index.html'), 'utf8');
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(json);
    if (data['@type'] === 'Article') return data.datePublished;
  }
  throw new Error(`no Article JSON-LD in ${slug}`);
}

const slugOf = (href) => href.match(/^\/journal\/([^/]+)\/$/)[1];

/** Cards in document order: plain <a> cards and <article> series cards. */
function cards() {
  const out = [];
  const re = /<(a|article)\s+([^>]*class="post-card[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g;
  for (const [, tag, attrs, inner] of INDEX.matchAll(re)) {
    const attr = (name) => (attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
    const links = tag === 'a'
      ? [attr('href')]
      : [...inner.matchAll(/href="(\/journal\/[^"]+\/)"/g)].map((m) => m[1]);
    out.push({
      series: tag === 'article',
      genre: attr('data-genre'),
      date: attr('data-date'),
      slugs: [...new Set(links.map(slugOf))],
      time: inner.match(/<time datetime="([^"]+)">([^<]+)<\/time>/),
    });
  }
  return out;
}

const posts = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, d.name, 'index.html')))
  .map((d) => d.name)
  .sort();

describe('journal index feed', () => {
  const list = cards();

  it('lists every journal post exactly once', () => {
    const listed = list.flatMap((c) => c.slugs).sort();
    expect(listed).toEqual(posts);
  });

  it('dates each card from the post Article JSON-LD (series: newest part)', () => {
    for (const card of list) {
      const dates = card.slugs.map(postDate).sort();
      expect(card.date, card.slugs.join()).toBe(card.series ? dates.at(-1) : dates[0]);
    }
  });

  it('orders cards newest first', () => {
    const dates = list.map((c) => c.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('shows the same date as a month-year <time>', () => {
    for (const card of list) {
      expect(card.time, card.slugs.join()).not.toBeNull();
      const [, datetime, text] = card.time;
      const [y, m] = card.date.split('-');
      expect(datetime).toBe(card.date);
      expect(text).toBe(`${MONTHS[Number(m) - 1]} ${y}`);
    }
  });

  it('uses only known genres, each with a filter button', () => {
    for (const card of list) expect(GENRES).toContain(card.genre);
    for (const g of GENRES) expect(INDEX).toContain(`data-filter="${g}"`);
  });

  it('keeps series parts in reading order (part 1 first)', () => {
    for (const card of list.filter((c) => c.series)) {
      expect(card.slugs.length).toBeGreaterThan(1);
    }
    const feed = INDEX.slice(INDEX.indexOf('<main'));
    expect(feed.indexOf('/journal/vira-i-religiya/"'))
      .toBeLessThan(feed.indexOf('/journal/vira-i-religiya-2/"'));
    expect(feed.indexOf('/journal/vira-i-religiya-2/"'))
      .toBeLessThan(feed.indexOf('/journal/bytva-tserkov/"'));
  });
});

describe('journal index Blog JSON-LD', () => {
  const blog = JSON.parse(INDEX.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

  it('matches the posts and their dates, newest first', () => {
    const entries = blog.blogPost.map((p) => ({
      slug: p.url.match(/\/journal\/([^/]+)\//)[1],
      date: p.datePublished,
    }));
    expect(entries.map((e) => e.slug).sort()).toEqual(posts);
    for (const e of entries) expect(e.date, e.slug).toBe(postDate(e.slug));
    const dates = entries.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
