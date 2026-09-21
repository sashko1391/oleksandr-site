// Ф2 step 2b: the rubric frame. Every post of «Паркінсон» must carry the same visible promise as the
// editorial policy — patient experience, a review date, a corrections log and crisis contacts.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');
const SITE = 'https://www.parkinsandr.tech';
const POLICY = '/parkinson/redaktsiina-polityka/';
const POSTS = ['diahnoz-u-27', 'rannii-parkinsonizm', 'parkinson-shcho-robyty', 'eksperyment-nad-soboyu', 'hoverla'];

const read = (rel) => readFileSync(join(PUBLIC, rel), 'utf8');
const post = (slug) => read(`journal/${slug}/index.html`);
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((m) => { const d = JSON.parse(m[1]); return d['@graph'] ?? [d]; });

describe('Parkinson rubric — the frame', () => {
  it('every post carries the frame above the article body', () => {
    for (const slug of POSTS) {
      const html = post(slug);
      const frame = html.match(/<div class="rubric-frame">[\s\S]*?<\/div>/);
      expect(frame, `${slug}: no frame`).not.toBeNull();
      const text = frame[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      expect(text, slug).toContain('Досвід пацієнта, а не медична порада');
      expect(text, `${slug}: the frame must refuse diagnosis and dosing advice`)
        .toContain('немає рекомендацій щодо діагнозу, дозування чи зміни лікування');
      expect(frame[0], `${slug}: the frame must link the policy`).toContain(`href="${POLICY}"`);
      // it has to be above the content: before the first section heading of the article
      const article = html.slice(html.indexOf('<article'));
      expect(article.indexOf('rubric-frame'), `${slug}: the frame is below the first heading`)
        .toBeLessThan(article.search(/<h2[\s>]/));
    }
  });

  it('the review date is visible, machine-readable and not the same field as dateModified', () => {
    for (const slug of POSTS) {
      const html = post(slug);
      const frame = html.match(/<div class="rubric-frame">[\s\S]*?<\/div>/)[0];
      expect(frame, `${slug}`).toContain('Джерела звіряв автор (не лікар)');
      const checked = frame.match(/<time datetime="(\d{4}-\d{2}-\d{2})">/);
      expect(checked, `${slug}: the review date needs a machine-readable time`).not.toBeNull();
      const article = ld(html).find((n) => [].concat(n['@type']).includes('Article'));
      expect(article, `${slug}: Article schema`).toBeDefined();
      expect(article.dateModified, `${slug}: dateModified must stay a separate date`).toBeDefined();
    }
  });

  it('every post ends with a corrections log', () => {
    for (const slug of POSTS) {
      const html = post(slug);
      const log = html.match(/<section class="corrections"[\s\S]*?<\/section>/);
      expect(log, `${slug}: no corrections log`).not.toBeNull();
      expect(log[0], slug).toMatch(/<h2[^>]*>Журнал виправлень<\/h2>/);
      expect(log[0], `${slug}: a log entry needs a date`).toMatch(/\d{1,2} \w+ 2026|\d{1,2} [а-яіїєґ]+ 2026/);
      const article = html.slice(html.indexOf('<article'));
      const withoutLog = article.replace(/<section class="corrections"[\s\S]*?<\/section>/, '');
      expect(article.indexOf('class="corrections"'), `${slug}: the log belongs after the text`)
        .toBeGreaterThan(withoutLog.lastIndexOf('<h2'));
    }
  });

  it('the policy page says what the frame promises', () => {
    const policy = read('parkinson/redaktsiina-polityka/index.html');
    for (const promise of [
      'не претендує на роль медичного довідника',
      'Особистий досвід',
      'Перевірювані твердження',
      'NICE NG71',
      'Журнал виправлень',
      'Не радить дозування препаратів',
      'не спонсоровані',
      '0 800 21 01 60',
    ]) expect(policy, `policy is missing «${promise}»`).toContain(promise);
    expect(policy.match(/<title>(.*?)<\/title>/)[1].length, 'policy title must stay under 60').toBeLessThan(60);
    expect(policy.match(/<meta name="description" content="([^"]*)"/)[1].length, 'policy description').toBeLessThan(155);
    expect((policy.match(/<h1[\s>]/g) ?? []).length, 'one H1 on the policy page').toBe(1);
    const page = ld(policy).find((n) => [].concat(n['@type']).includes('WebPage'));
    expect(page.url).toBe(`${SITE}${POLICY}`);
    expect(ld(policy).some((n) => [].concat(n['@type']).includes('ItemList')), 'the policy is not a collection').toBe(false);
    const crumbs = ld(policy).find((n) => [].concat(n['@type']).includes('BreadcrumbList'));
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(['Головна', 'Паркінсон', 'Редакційна політика']);
  });

  it('the hub exists, lists the five posts and carries the frame and the crisis contacts', () => {
    const hub = read('parkinson/index.html');
    expect(existsSync(join(PUBLIC, 'parkinson', 'index.html'))).toBe(true);
    for (const slug of POSTS) expect(hub, `hub is missing ${slug}`).toContain(`href="/journal/${slug}/"`);
    expect(hub).toContain('Досвід пацієнта, а не медична порада');
    expect(hub).toContain('0 800 21 01 60');
    expect(hub).toContain(`href="${POLICY}"`);
    const list = ld(hub).find((n) => [].concat(n['@type']).includes('ItemList'));
    expect(list.numberOfItems).toBe(5);
  });

  it('both new pages are in the sitemap', () => {
    const sitemap = read('sitemap.xml');
    expect(sitemap).toContain(`<loc>${SITE}/parkinson/</loc>`);
    expect(sitemap).toContain(`<loc>${SITE}${POLICY}</loc>`);
  });
});
