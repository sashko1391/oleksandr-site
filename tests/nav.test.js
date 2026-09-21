// Ф3: one menu, injected from scripts/inject-nav.mjs, on every page a reader can land on.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { MENU, menuHtml, inject, urlOf } from '../scripts/inject-nav.mjs';

const PUBLIC = join(process.cwd(), 'public');

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
const indexable = pages.filter((p) => !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(p.html));

describe('site menu', () => {
  it('is the six sections of doc/PERSONAL_SITE_PLAN.md, commerce last', () => {
    expect(MENU.map((m) => [m.label, m.href])).toEqual([
      ['Журнал', '/journal/'],
      ['Код', '/code/'],
      ['Творчість', '/creative/'],
      ['Паркінсон', '/parkinson/'],
      ['Про мене', '/pro-mene/'],
      ['Робота зі мною', '/services/'],
    ]);
    expect(MENU.filter((m) => m.cta).map((m) => m.href)).toEqual(['/services/']);
  });

  it('every indexable page carries it exactly once, with every item', () => {
    expect(indexable.length).toBeGreaterThan(45);
    for (const p of indexable) {
      expect((p.html.match(/<ul class="site-menu">/g) ?? []).length, `${p.rel}: menu count`).toBe(1);
      for (const item of MENU) {
        expect(p.html, `${p.rel}: missing «${item.label}»`).toContain(`<a href="${item.href}"`);
      }
      expect((p.html.match(/<style data-site-menu>/g) ?? []).length, `${p.rel}: menu styles`).toBe(1);
    }
  });

  it('marks the section the page belongs to — by its breadcrumb, not by its URL', () => {
    const marked = (rel) => {
      const page = pages.find((p) => p.rel === rel).html;
      return page.match(/<a href="([^"]+)"[^>]*aria-current="page"/)?.[1];
    };
    expect(marked('journal/hoverla/index.html'), 'a rubric post lives under /journal/ but belongs to /parkinson/')
      .toBe('/parkinson/');
    expect(marked('journal/holodylnyi-apokalipsys/index.html')).toBe('/creative/');
    expect(marked('journal/velozaizd/index.html')).toBe('/journal/');
    expect(marked('blog/jarvis-ai-assistant/index.html')).toBe('/code/');
    expect(marked('blog/skilky-koshtuye-sajt/index.html')).toBe('/services/');
    expect(marked('projects/atlas/index.html')).toBe('/services/');
    expect(marked('pro-mene/index.html')).toBe('/pro-mene/');
  });

  it('no page marks two sections at once', () => {
    for (const p of indexable) {
      const menu = p.html.match(/<ul class="site-menu">[\s\S]*?<\/ul>/)[0];
      expect((menu.match(/aria-current="page"/g) ?? []).length, `${p.rel}: menu`).toBeLessThanOrEqual(1);
    }
  });

  it('is idempotent: injecting again changes nothing', () => {
    for (const p of indexable) expect(inject(p.html, p.rel), p.rel).toBe(p.html);
  });

  it('replaces the block it owns and nothing else', () => {
    const page = '<html><head></head><body><nav aria-label="Основна навігація">' +
      '<a href="/" class="logo">L</a><a href="/" class="nav-back">← На головну</a></nav><p>текст</p></body></html>';
    const once = inject(page, 'code/index.html');
    expect(once).toContain('<p>текст</p>');
    expect(once, 'the generic back link goes away').not.toContain('nav-back');
    expect(inject(once, 'code/index.html')).toBe(once);
    // a page that moved section gets the new marking, still one menu
    const moved = inject(once, 'creative/index.html');
    expect((moved.match(/<ul class="site-menu">/g) ?? []).length).toBe(1);
    expect(moved).toContain('<a href="/creative/" aria-current="page">');
  });

  it('leaves a page without the standard header alone', () => {
    expect(inject('<html><body><p>404</p></body></html>', '404.html')).toBeNull();
    const notFound = pages.find((p) => p.rel === '404.html');
    expect(notFound.html, '404 stays as it is').not.toContain('site-menu');
  });

  it('menuHtml keeps every link absolute and tappable', () => {
    const html = menuHtml('code/index.html');
    expect(html.match(/href="\/[a-z-]+\/"/g)).toHaveLength(MENU.length);
    expect(urlOf('code/index.html')).toBe('/code/');
  });
});
