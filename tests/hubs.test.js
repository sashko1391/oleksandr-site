// Ф2: the section hubs. A hub is a page that has to stay in sync with the posts it collects — visible
// cards, the ItemList in its schema and the breadcrumb a reader sees must all say the same thing.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HUB_MEMBERS, TELEGRAM_CHANNEL, PERSONAL_CONTACT } from '../scripts/link-policy.mjs';
import { FEEDS } from '../scripts/build-feed.mjs';
import { maskInert } from '../scripts/inject-rss.mjs';

const PUBLIC = join(process.cwd(), 'public');
const SITE = 'https://www.parkinsandr.tech';

/** The collection pages of Ф2. The rubric frame of /parkinson/ has its own suite (parkinson-frame). */
const HUBS = [
  { slug: 'parkinson', crumb: 'Паркінсон' },
  { slug: 'code', crumb: 'Код' },
  { slug: 'creative', crumb: 'Творчість' },
  { slug: 'blog', crumb: 'Блог' },
];

const read = (rel) => readFileSync(join(PUBLIC, rel), 'utf8');
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((m) => { const d = JSON.parse(m[1]); return d['@graph'] ?? [d]; });
const node = (html, type) => ld(html).find((n) => [].concat(n['@type']).includes(type));
const attr = (html, re) => html.match(re)?.[1];

describe('section hubs', () => {
  it('each hub page exists and is in the sitemap', () => {
    const sitemap = read('sitemap.xml');
    for (const { slug } of HUBS) {
      expect(existsSync(join(PUBLIC, slug, 'index.html')), slug).toBe(true);
      expect(sitemap, `${slug} missing from the sitemap`).toContain(`<loc>${SITE}/${slug}/</loc>`);
    }
  });

  it('follows the page rules of AGENTS.md: one H1, one main, title < 60, description < 155', () => {
    for (const { slug } of HUBS) {
      const html = read(`${slug}/index.html`);
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${slug}: H1 count`).toBe(1);
      expect((html.match(/<main[\s>]/g) ?? []).length, `${slug}: main count`).toBe(1);
      expect(attr(html, /<title>(.*?)<\/title>/).length, `${slug}: title length`).toBeLessThan(60);
      const description = attr(html, /<meta name="description" content="([^"]*)"/);
      expect(description.length, `${slug}: description length`).toBeLessThan(155);
      expect(description.length, `${slug}: description too short to be useful`).toBeGreaterThan(110);
      expect(html, `${slug}: canonical`).toContain(`<link rel="canonical" href="${SITE}/${slug}/">`);
      expect(html, `${slug}: RSS link`).toContain('type="application/rss+xml"');
      expect(html, `${slug}: no lead form belongs on a hub`).not.toContain('data-lead-form');
    }
  });

  it('carries CollectionPage, ItemList and BreadcrumbList, authored by me', () => {
    for (const { slug, crumb } of HUBS) {
      const html = read(`${slug}/index.html`);
      const page = node(html, 'CollectionPage');
      expect(page, `${slug}: CollectionPage`).toBeDefined();
      expect(page.author['@id']).toBe(`${SITE}/pro-mene/#author`);
      expect(page.url).toBe(`${SITE}/${slug}/`);
      const list = node(html, 'ItemList');
      expect(list, `${slug}: ItemList`).toBeDefined();
      expect(list.numberOfItems).toBe(list.itemListElement.length);
      const crumbs = node(html, 'BreadcrumbList');
      const second = crumbs.itemListElement.find((i) => i.position === 2);
      expect([second.name, second.item], `${slug}: breadcrumb`).toEqual([crumb, `${SITE}/${slug}/`]);
    }
  });

  it('the visible breadcrumb repeats the one in the schema, link and all', () => {
    for (const { slug, crumb } of HUBS) {
      const html = read(`${slug}/index.html`);
      const nav = html.match(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/)[0];
      const visible = nav.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      expect(visible, `${slug}`).toContain('Головна');
      expect(visible, `${slug}`).toContain(crumb);
      expect(nav, `${slug}: the first crumb must link home`).toMatch(/<a href="\/">/);
      expect(nav, `${slug}: the current crumb is not a link`).toContain('aria-current="page"');
      const links = [...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of links) expect(href, `${slug}: ${href}`).toMatch(/^\/(?:[a-z-]+\/)*$/);
    }
  });

  it('no card is hidden from the reader while counting in the schema', () => {
    for (const { slug } of HUBS) {
      const html = read(`${slug}/index.html`);
      for (const card of html.match(/<article class="card"[^>]*>/g) ?? []) {
        expect(card, `${slug}: a hidden card`).not.toMatch(/\shidden|aria-hidden="true"|display\s*:\s*none/);
      }
      const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
      expect(css, `${slug}: cards must stay visible`).not.toMatch(/\.card\s*\{[^}]*display\s*:\s*none/);
    }
  });

  it('the ItemList is exactly the cards the reader sees, newest first', () => {
    for (const { slug } of HUBS) {
      const html = read(`${slug}/index.html`);
      const cards = [...html.matchAll(/<article class="card">[\s\S]*?<h3><a href="([^"]+)">([^<]+)<\/a>[\s\S]*?<\/article>/g)]
        .map((m) => ({ url: SITE + m[1], name: m[2] }));
      const items = node(html, 'ItemList').itemListElement.map((i) => ({ url: i.item.url, name: i.item.name }));
      expect(items, `${slug}: schema and cards differ`).toEqual(cards);
      const sections = html.split('<section').slice(1);
      for (const section of sections) {
        const dates = [...section.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
        expect([...dates].sort().reverse(), `${slug}: a section is not newest-first`).toEqual(dates);
      }
    }
  });

  it('shows every post its manifest assigns to it', () => {
    for (const { slug } of HUBS) {
      const html = read(`${slug}/index.html`);
      const members = [...HUB_MEMBERS[`${slug}/`].primary, ...HUB_MEMBERS[`${slug}/`].also];
      for (const file of members) {
        const url = '/' + file.replace('index.html', '');
        expect(html, `${slug}: ${url} is in HUB_MEMBERS but not on the page`).toContain(`href="${url}"`);
      }
      const linked = [...html.matchAll(/<h3><a href="(\/(?:blog|journal)\/[^"]+)">/g)].map((m) => m[1]);
      const expected = members.map((f) => '/' + f.replace('index.html', ''));
      expect(linked.slice().sort(), `${slug}: the page shows posts the manifest does not list`).toEqual(expected.slice().sort());
    }
  });

  it('does not shrink body text or tap targets', () => {
    for (const { slug } of HUBS) {
      const css = read(`${slug}/index.html`).match(/<style>([\s\S]*?)<\/style>/)[1];
      // the card body and the footer inherit 1rem; only labels (.card-meta) may be smaller
      expect(css, `${slug}: card text must stay at 1rem`).not.toMatch(/\.card p \{[^}]*font-size/);
      expect(css, `${slug}: footer text must stay at 1rem`).not.toMatch(/footer \{[^}]*font-size/);
      for (const rule of ['.card h3 a', '.hub-links a', 'footer a', '.breadcrumbs a']) {
        const found = css.match(new RegExp(`${rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`));
        expect(found?.[0], `${slug}: ${rule} needs min-height 48px`).toMatch(/min-height: 48px/);
      }
    }
  });

  it('every blog post is reachable from a hub', () => {
    const archive = read('blog/index.html');
    const posts = HUB_MEMBERS['blog/'].also;
    expect(posts).toHaveLength(12);
    for (const file of posts) expect(archive).toContain(`href="/${file.replace('index.html', '')}"`);
  });

  it('every section with a feed offers both ways to subscribe, visibly', () => {
    for (const feed of FEEDS.slice(1)) {
      const hub = feed.file.replace('feed.xml', 'index.html');
      const body = maskInert(read(hub)).replace(/<head[\s>][\s\S]*?<\/head>/i, '');
      expect(body, `${hub}: no visible RSS link`).toContain(`href="/${feed.file}"`);
      expect(body, `${hub}: no Telegram channel link`).toContain(`href="${TELEGRAM_CHANNEL}"`);
    }
  });

  it('the Telegram channel is one URL across the site — no second address to keep in sync', () => {
    const urls = new Set();
    for (const rel of Object.keys(HUB_MEMBERS).map((h) => `${h}index.html`).concat('index.html')) {
      if (!existsSync(join(PUBLIC, rel))) continue;
      for (const m of read(rel).matchAll(/https:\/\/t\.me\/[^"'\s<]+/g)) urls.add(m[0]);
    }
    // two Telegram addresses exist on purpose and mean different things: the broadcast channel and the
    // owner's personal contact on the commercial pages. A third one would be an address to keep in sync.
    expect([...urls].sort(), 'an unknown Telegram address appeared')
      .toEqual([TELEGRAM_CHANNEL, PERSONAL_CONTACT].sort());
  });

  it('the hubs link to each other and to the pages that own the rest', () => {
    expect(read('code/index.html')).toContain('href="/blog/"');
    expect(read('code/index.html')).toContain('href="/services/"');
    expect(read('blog/index.html')).toContain('href="/code/"');
    expect(read('creative/index.html')).toContain('href="/journal/"');
    expect(read('creative/index.html')).toContain('href="/parkinson/"');
    expect(read('parkinson/index.html')).toContain('href="/journal/"');
    expect(read('services/index.html'), '/services/ must point at the archive').toContain('href="/blog/"');
    // the journal keeps the full feed, but a reader must be able to get to the topic hubs from it
    const journal = read('journal/index.html');
    for (const hub of ['/parkinson/', '/creative/', '/code/']) {
      expect(journal, `/journal/ must link ${hub}`).toContain(`href="${hub}"`);
    }
  });
});
