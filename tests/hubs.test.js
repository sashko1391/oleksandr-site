// Ф2: the section hubs. A hub is a page that has to stay in sync with the posts it collects — visible
// cards, the ItemList in its schema and the breadcrumb a reader sees must all say the same thing.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HUB_MEMBERS } from '../scripts/link-policy.mjs';

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

  it('the visible breadcrumb repeats the one in the schema', () => {
    for (const { slug, crumb } of HUBS) {
      const html = read(`${slug}/index.html`);
      const visible = html.match(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/)[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      expect(visible, `${slug}`).toContain('Головна');
      expect(visible, `${slug}`).toContain(crumb);
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
