import { describe, it, expect } from 'vitest';
import { planRepoint, verifyPlan, EXPECTED_F2, EXPECTED_F3 } from '../scripts/repoint-anchors.mjs';
import { SITE, PERSONAL_CONTACT, PHASES } from '../scripts/link-policy.mjs';
import { loadSite, urlOf } from '../scripts/check-links.mjs';

// Ф1 step 3: the repoint script changes only <a href> values and the expected BreadcrumbList fields.

const ld = (data) => `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
const crumbs = (...items) =>
  ld({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  });
const site = (pages) => ({
  pages: Object.entries(pages).map(([rel, html]) => ({ rel, html })),
  files: new Set(Object.keys(pages)),
  virtual: new Set(),
});
const run = (pages, phase = 'f1') => planRepoint(site(pages), phase);
const output = (plan, rel) => plan.changes.find((c) => c.rel === rel)?.html;
const PARKINSON = 'journal/parkinson-shcho-robyty/index.html';

describe('R1/R2 — only the href of <a> changes', () => {
  it('repoints a commercial CTA and leaves text, other attributes and prose alone', () => {
    const html = '<p>Текст /#chat-section</p><a class="cta-btn" href="/#chat-section" data-href="/#chat-section">Обговорити проєкт →</a>';
    const plan = run({ 'blog/x/index.html': html });
    expect(output(plan, 'blog/x/index.html')).toBe(html.replace('href="/#chat-section"', 'href="/services/#contact"'));
    expect(plan.stats).toEqual({ R1: 1, R2: 0, R3: 0, R4: 0 });
    expect(plan.errors).toEqual([]);
  });

  it('keeps the quote style in any attribute order, unquoted too', () => {
    const plan = run({ 'projects/x/index.html': `<a href='/#chat-section' class=x>A</a> <a class="y" href=/#chat-section>B</a>` });
    expect(output(plan, 'projects/x/index.html')).toBe(`<a href='/services/#contact' class=x>A</a> <a class="y" href=/services/#contact>B</a>`);
    expect(plan.stats.R1).toBe(2);
  });

  it('applies R1 in services/*, projects/*, blog/* and pro-mene', () => {
    const cta = '<a href="/#chat-section">CTA</a>';
    const plan = run({ 'services/x/index.html': cta, 'projects/x/index.html': cta, 'blog/x/index.html': cta, 'pro-mene/index.html': cta });
    expect(plan.stats.R1).toBe(4);
    expect(plan.changes).toHaveLength(4);
  });

  it('does not touch scripts, comments or JSON-LD strings', () => {
    const html = `<script>const s = '<a href="/#chat-section">x</a>';</script><!-- <a href="/#chat-section">y</a> -->${ld({ url: `${SITE}/#chat-section` })}`;
    expect(run({ 'blog/x/index.html': html })).toEqual({ stats: { R1: 0, R2: 0, R3: 0, R4: 0 }, errors: [], changes: [] });
  });

  it('R2: «напишіть мені» in a manifest post goes to the personal contact', () => {
    const plan = run({ [PARKINSON]: '<p>Знайшли помилку — <a href="/#chat-section">напишіть мені</a>.</p>' });
    expect(output(plan, PARKINSON)).toBe(`<p>Знайшли помилку — <a href="${PERSONAL_CONTACT}">напишіть мені</a>.</p>`);
    expect(plan.stats.R2).toBe(1);
  });

  it('R2: another /#chat-section in a manifest post is an error, not a silent change', () => {
    const plan = run({ [PARKINSON]: '<a href="/#chat-section">замовити сайт</a>' });
    expect(plan.changes).toEqual([]);
    expect(plan.errors).toHaveLength(1);
  });

  it('reports /#chat-section outside R1 and R2 instead of guessing', () => {
    const cta = '<a href="/#chat-section">CTA</a>';
    const plan = run({ 'journal/other/index.html': cta, 'pricing/index.html': cta });
    expect(plan.changes).toEqual([]);
    expect(plan.errors).toHaveLength(2);
  });

  it('never touches the homepage — no changes and no complaints', () => {
    expect(run({ 'index.html': '<a href="/#chat-section">x</a><a href="#chat-section">y</a>' })).toEqual({
      stats: { R1: 0, R2: 0, R3: 0, R4: 0 },
      errors: [],
      changes: [],
    });
  });
});

describe('R3/R4 — breadcrumbs, checked by a semantic diff', () => {
  const home = ['Головна', `${SITE}/`];

  it('R3: …/#scenarios → …/services/, name and formatting kept', () => {
    const html = crumbs(home, ['Послуги', `${SITE}/#scenarios`], ['Лендінг', `${SITE}/services/x/`]);
    const plan = run({ 'services/x/index.html': html });
    expect(output(plan, 'services/x/index.html')).toBe(html.replace(`"${SITE}/#scenarios"`, `"${SITE}/services/"`));
    expect(plan.stats.R3).toBe(1);
  });

  it('R4: …/#portfolio «Портфоліо» → …/services/ «Послуги»', () => {
    const plan = run({ 'projects/x/index.html': crumbs(home, ['Портфоліо', `${SITE}/#portfolio`], ['X', `${SITE}/projects/x/`]) });
    const json = JSON.parse(output(plan, 'projects/x/index.html').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
    expect(json.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: 'Послуги', item: `${SITE}/services/` });
    expect(plan.stats.R4).toBe(1);
  });

  it.each([
    ['R4 under another name', crumbs(home, ['Роботи', `${SITE}/#portfolio`])],
    ['a #scenarios URL outside a BreadcrumbList', ld({ '@type': 'WebPage', url: `${SITE}/#scenarios` })],
    ['a #scenarios item of a plain ItemList', ld({ '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: `${SITE}/#scenarios` }] })],
    ['a «Портфоліо» rename outside the #portfolio item', ld([JSON.parse(crumbs(home, ['Послуги', `${SITE}/#scenarios`]).replace(/<\/?script[^>]*>/g, '')), { '@type': 'Thing', name: 'Портфоліо' }])],
  ])('refuses %s and changes nothing', (_, html) => {
    const plan = run({ 'services/x/index.html': html });
    expect(plan.changes).toEqual([]);
    expect(plan.errors.length).toBeGreaterThan(0);
  });

  it('leaves JSON-LD inside an HTML comment alone', () => {
    const html = `<!-- ${crumbs(home, ['Послуги', `${SITE}/#scenarios`])} -->`;
    expect(run({ 'services/x/index.html': html }).changes).toEqual([]);
  });

  it('leaves entity @id (ours and the client) and /#blog alone', () => {
    const html = ld({ '@id': `${SITE}/#business` }) + ld({ '@id': 'https://www.ladomyr.kiev.ua/#business' }) + crumbs(home, ['Блог', `${SITE}/#blog`]);
    expect(run({ 'blog/x/index.html': html, 'projects/ladomyr/index.html': html }).changes).toEqual([]);
  });
});

describe('the whole plan', () => {
  const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
  const pages = {
    'blog/x/index.html': crlf('<a href="/#chat-section">CTA</a>\n' + crumbs(['Головна', `${SITE}/`], ['Блог', `${SITE}/#blog`])),
    'services/x/index.html': crlf(crumbs(['Головна', `${SITE}/`], ['Послуги', `${SITE}/#scenarios`])),
  };

  it('is idempotent: a second run plans nothing', () => {
    const first = run(pages);
    const second = run(Object.fromEntries(first.changes.map((c) => [c.rel, c.html])));
    expect(first.changes).toHaveLength(2);
    expect(second.changes).toEqual([]);
  });

  it('preserves CRLF line endings', () => {
    for (const change of run(pages).changes) expect(change.html.replace(/\r\n/g, '')).not.toMatch(/\n/);
  });

  it('verifyPlan: reports count mismatches and planning errors; nothing to do means no count check', () => {
    const valid = site({ 'index.html': `<link rel="canonical" href="${SITE}${urlOf('index.html')}">` });
    const policy = { homeAnchors: [] };
    const stats = { R1: 1, R2: 0, R3: 0, R4: 0 };
    expect(verifyPlan(valid, { stats, errors: ['boom'], changes: [] }, { R1: 2 }, policy)).toEqual(['boom', 'R1: expected 2, planned 1']);
    expect(verifyPlan(valid, { stats: { R1: 0, R2: 0, R3: 0, R4: 0 }, errors: [], changes: [] }, { R1: 2 }, policy)).toEqual([]);
  });
});


describe('R5/R6 — breadcrumbs move to the hubs (Ф2)', () => {
  const post = (rel, name, item) => ({ [rel]: crumbs(['Головна', `${SITE}/`], [name, item], ['Пост', `${SITE}/${rel.replace('index.html', '')}`]) });

  it('R5: a devlog goes from the homepage anchor to /code/', () => {
    const rel = 'blog/devlog-empire-online/index.html';
    const plan = run(post(rel, 'Блог', `${SITE}/#blog`), 'f2');
    expect(plan.stats).toEqual({ R5: 1, R6: 0 });
    expect(output(plan, rel)).toContain(`"name": "Код"`);
    expect(output(plan, rel)).toContain(`"item": "${SITE}/code/"`);
    expect(plan.errors).toEqual([]);
  });

  it('R5: a library article goes to /services/, R6: a rubric post to /parkinson/', () => {
    const plan = run({
      ...post('blog/skilky-koshtuye-sajt/index.html', 'Блог', `${SITE}/#blog`),
      ...post(PARKINSON, 'Поза кодом', `${SITE}/journal/`),
    }, 'f2');
    expect(plan.stats).toEqual({ R5: 1, R6: 1 });
    expect(output(plan, 'blog/skilky-koshtuye-sajt/index.html')).toContain(`"item": "${SITE}/services/"`);
    expect(output(plan, PARKINSON)).toContain(`"item": "${SITE}/parkinson/"`);
  });

  it('leaves the seven journal posts that keep their section untouched under f2', () => {
    const rel = 'journal/velozaizd/index.html';
    const plan = run(post(rel, 'Журнал', `${SITE}/journal/`), 'f2');
    expect(plan.changes).toEqual([]);
    expect(plan.stats).toEqual({ R5: 0, R6: 0 });
  });

  it('R7 (Ф3): those same posts are renamed «Поза кодом» → «Журнал», the URL untouched', () => {
    const rel = 'journal/velozaizd/index.html';
    const plan = run(post(rel, 'Поза кодом', `${SITE}/journal/`), 'f3');
    expect(plan.stats).toEqual({ R7: 1 });
    const out = output(plan, rel);
    expect(out).toContain('"name": "Журнал"');
    expect(out).toContain(`"item": "${SITE}/journal/"`);
    expect(plan.errors).toEqual([]);
  });

  it('touches only position 2, and keeps the rest of the block byte for byte', () => {
    const rel = 'blog/jarvis-ai-assistant/index.html';
    const html = post(rel, 'Блог', `${SITE}/#blog`)[rel];
    const out = output(run({ [rel]: html }, 'f2'), rel);
    expect(out).toContain(`"name": "Головна"`);
    expect(out).toContain(`"position": 3`);
    expect(out.replace('"name": "Код"', '"name": "Блог"').replace(`"item": "${SITE}/code/"`, `"item": "${SITE}/#blog"`)).toBe(html);
  });

  it('reports a page whose position-2 crumb is not what Ф1 left', () => {
    const rel = 'blog/jarvis-ai-assistant/index.html';
    // same URL, different name: the post was edited by hand, so the migration must stop and say so
    const html = crumbs(['Головна', `${SITE}/`], ['Статті', `${SITE}/#blog`], ['Пост', `${SITE}/blog/jarvis-ai-assistant/`]);
    const plan = run({ [rel]: html }, 'f2');
    expect(plan.errors.length, 'a renamed crumb must not be migrated silently').toBeGreaterThan(0);
    expect(plan.changes).toEqual([]);
  });

  it('refuses a position-2 item that is not part of a BreadcrumbList', () => {
    const rel = 'blog/jarvis-ai-assistant/index.html';
    const html = ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Головна', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Блог', item: `${SITE}/#blog` },
        ] },
        // a plain ItemList that happens to carry the same URL at position 2
        { '@type': 'ItemList', itemListElement: [
          { '@type': 'ListItem', position: 1, item: `${SITE}/blog/` },
          { '@type': 'ListItem', position: 2, name: 'Блог', item: `${SITE}/#blog` },
        ] },
      ],
    });
    const plan = run({ [rel]: html }, 'f2');
    expect(plan.changes, 'a blind string replace would have rewritten both').toEqual([]);
    expect(plan.errors.length).toBeGreaterThan(0);
  });

  it('is idempotent: a migrated post plans nothing', () => {
    const rel = 'journal/hoverla/index.html';
    const plan = run(post(rel, 'Паркінсон', `${SITE}/parkinson/`), 'f2');
    expect(plan.changes).toEqual([]);
  });
});

describe('public/ (integration)', () => {
  it('is migrated: a new run of either phase plans nothing and reports nothing', () => {
    for (const phase of ['f1', 'f2']) {
      const plan = planRepoint(loadSite(), phase);
      expect(plan.errors, phase).toEqual([]);
      expect(plan.changes.map((c) => c.rel), phase).toEqual([]);
    }
  });

  it('the migration inventories are the ones the plans fixed', () => {
    expect(EXPECTED_F2).toEqual({ R5: 12, R6: 9 });
    expect(EXPECTED_F3, 'seven journal posts keep the section and are renamed').toEqual({ R7: 7 });
    expect(verifyPlan(loadSite(), planRepoint(loadSite(), 'f3'), EXPECTED_F3, PHASES['f2-done'])).toEqual([]);
    expect(verifyPlan(loadSite(), planRepoint(loadSite(), 'f2'), EXPECTED_F2, PHASES['f2-done'])).toEqual([]);
  });
});
