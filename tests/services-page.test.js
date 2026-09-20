import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePage } from '../scripts/check-links.mjs';

// Contract of the /services/ hub (doc/SERVICES_HUB_PLAN.md, step 2; PAGE_STANDARD_2026 adapted to static HTML).

const SITE = 'https://www.parkinsandr.tech';
const BUSINESS_ID = `${SITE}/#business`;
const html = readFileSync(join(import.meta.dirname, '..', 'public', 'services', 'index.html'), 'utf8');
const page = parsePage(html);

const text = (s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const words = (s) => text(s).split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const section = (id) => html.match(new RegExp(`<section id="${id}"[^>]*>([\\s\\S]*?)</section>`))?.[1] ?? '';
const nodes = (type) =>
  page.ld.flatMap((block) => block['@graph'] ?? [block]).filter((node) => node['@type'] === type);

const CONTENT_SECTIONS = ['problem', 'services', 'benefits', 'process', 'cases', 'pricing', 'library'];

describe('/services/ page contract', () => {
  it('has one <main>, one <h1> and no collapsed content', () => {
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details\b/);
  });

  it('has a title of at most 60 and a description of 150–154 characters', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    const description = html.match(/<meta name="description" content="([^"]*)">/)[1];
    expect([...title].length).toBeLessThanOrEqual(60);
    expect([...description].length).toBeGreaterThanOrEqual(150);
    expect([...description].length).toBeLessThanOrEqual(154); // AGENTS: description < 155
  });

  it('is self-canonical and indexable', () => {
    expect(page.canonicals).toEqual([`${SITE}/services/`]);
    expect(page.noindex).toBe(false);
  });

  it('gives every image an alt and dimensions; only the hero photo is high priority, the rest lazy', () => {
    const imgs = html.match(/<img\b[^>]*>/g);
    for (const img of imgs) {
      expect(attr(img, 'alt'), img).toBeTruthy();
      expect(attr(img, 'width'), img).toMatch(/^\d+$/);
      expect(attr(img, 'height'), img).toMatch(/^\d+$/);
    }
    const [hero, ...rest] = imgs;
    expect(attr(hero, 'fetchpriority')).toBe('high');
    for (const img of rest) expect(attr(img, 'loading'), img).toBe('lazy');
  });

  it('keeps the section order of the standard: problem → … → FAQ → contact', () => {
    const ids = [...CONTENT_SECTIONS, 'faq', 'contact'];
    const positions = ids.map((id) => html.indexOf(`<section id="${id}"`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('opens each content section with a question H2 and a 40–60-word answer', () => {
    for (const id of CONTENT_SECTIONS) {
      const body = section(id);
      expect(text(body.match(/<h2>([\s\S]*?)<\/h2>/)[1]), id).toMatch(/\?$/);
      const answer = words(body.match(/<p class="answer">([\s\S]*?)<\/p>/)[1]);
      expect(answer, id).toBeGreaterThanOrEqual(40);
      expect(answer, id).toBeLessThanOrEqual(60);
    }
  });

  it('shows 5–7 FAQ questions, each exactly as in FAQPage, with 50–300-word answers', () => {
    const visible = [...section('faq').matchAll(/<div class="faq-item">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)]
      .map(([, q, a]) => ({ q: text(q), a: text(a) }));
    expect(visible.length).toBeGreaterThanOrEqual(5);
    expect(visible.length).toBeLessThanOrEqual(7);
    const [faq] = nodes('FAQPage');
    expect(faq.mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }))).toEqual(visible);
    for (const { a } of visible) {
      expect(words(a)).toBeGreaterThanOrEqual(50);
      expect(words(a)).toBeLessThanOrEqual(300);
    }
  });

  it('repeats one primary action: every link to the form carries a unique data-cta, in hero and mid-page', () => {
    const ctas = [...html.matchAll(/<a\b[^>]*href="#contact"[^>]*>/g)].map(([tag]) => attr(tag, 'data-cta'));
    expect(ctas.every(Boolean)).toBe(true);
    expect(new Set(ctas).size).toBe(ctas.length);
    expect(ctas).toEqual(expect.arrayContaining(['hero', 'benefits']));
    expect(section('contact')).toMatch(/<button type="submit"[^>]*>Обговорити проєкт<\/button>/);
  });

  it('describes in JSON-LD only what is visible: collection, 5 services, breadcrumbs', () => {
    const [collection] = nodes('CollectionPage');
    expect(collection.url).toBe(`${SITE}/services/`);
    expect(collection.about).toEqual({ '@id': BUSINESS_ID });
    expect(collection.author).toEqual({ '@id': `${SITE}/pro-mene/#author` });

    const [list] = nodes('ItemList');
    const services = list.itemListElement.map((e) => e.item);
    const cards = [...section('services').matchAll(/<a class="card" href="([^"]+)">\s*<h3>([^<]+)<\/h3>/g)]
      .map(([, href, name]) => ({ url: SITE + href, name }));
    expect(services.map((s) => ({ url: s.url, name: s.name }))).toEqual(cards);
    expect(list.numberOfItems).toBe(cards.length);
    for (const s of services) {
      expect(s['@type']).toBe('Service');
      expect(s.provider).toEqual({ '@id': BUSINESS_ID }); // reference only: the full node stays on / until Ф3
    }

    const [crumbs] = nodes('BreadcrumbList');
    const visibleCrumbs = [...html.match(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/)[0].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
      .map(([, li]) => text(li));
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(visibleCrumbs);
    expect(crumbs.itemListElement.map((i) => i.item)).toEqual([`${SITE}/`, `${SITE}/services/`]);
  });

  it('has a form with visible labels, required contact fields and a hidden honeypot', () => {
    const form = section('contact').match(/<form\b[\s\S]*?<\/form>/)[0];
    const fields = [...form.matchAll(/<(input|textarea)\b[^>]*>/g)].map(([tag]) => tag);
    for (const field of fields) {
      expect(form, attr(field, 'id')).toContain(`<label for="${attr(field, 'id')}"`);
    }
    const byName = (name) => fields.find((f) => attr(f, 'name') === name);
    expect(byName('name')).toMatch(/\srequired\b/);
    expect(byName('contact')).toMatch(/\srequired\b/);
    expect(byName('message')).not.toMatch(/\srequired\b/);
    expect(attr(byName('lf-extra'), 'tabindex')).toBe('-1');
    expect(form).toMatch(/<div class="hp" aria-hidden="true" inert>/); // inert + non-semantic name: autofill must not fill it
    expect(form).toMatch(/href="\/privacy\/"/);
  });
});
