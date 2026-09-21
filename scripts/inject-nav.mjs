#!/usr/bin/env node
// Ф3 of doc/PERSONAL_SITE_PLAN.md: one menu on every page, from one place.
// Idempotent: the markup lives between <!-- nav:start --> and <!-- nav:end -->, the styles in
// <style data-site-menu>; a second run rewrites those and nothing else.
// `node scripts/inject-nav.mjs [--check]` — --check reports pages that would change and writes nothing.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** The sections of the site, in reading order; «Робота зі мною» is the one commercial item. */
export const MENU = [
  { href: '/journal/', label: 'Журнал' },
  { href: '/code/', label: 'Код' },
  { href: '/creative/', label: 'Творчість' },
  { href: '/parkinson/', label: 'Паркінсон' },
  { href: '/pro-mene/', label: 'Про мене' },
  { href: '/services/', label: 'Робота зі мною', cta: true },
];

const START = '<!-- nav:start -->';
const END = '<!-- nav:end -->';
const STYLE_RE = /\n?<style data-site-menu>[\s\S]*?<\/style>/;

const STYLE = `<style data-site-menu>
.site-menu { display: flex; flex-wrap: nowrap; gap: 0.25rem 1.25rem; align-items: center; list-style: none;
  margin: 0; padding: 0; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.site-menu::-webkit-scrollbar { display: none; }
.site-menu a { display: inline-flex; align-items: center; min-height: 48px; padding: 0 0.15rem; white-space: nowrap;
  color: #4A4A4A; text-decoration: none; font-size: 0.95rem; font-weight: 500; }
.site-menu a:hover { color: #1B3A5C; }
.site-menu a[aria-current="page"] { color: #1B3A5C; box-shadow: inset 0 -2px 0 #5BA4D9; }
.site-menu .site-menu-cta { color: #1B3A5C; font-weight: 600; }
.site-menu .site-menu-cta::before { content: '·'; margin-right: 1rem; color: rgba(27,58,92,0.3); }
@media (max-width: 860px) {
  /* the logo keeps the first row, the sections get their own scrollable one */
  nav[aria-label="Основна навігація"] { flex-wrap: wrap; row-gap: 0; }
  .site-menu { width: 100%; gap: 0.25rem 1.1rem; }
  .site-menu a { font-size: 0.92rem; min-height: 44px; }
  .site-menu .site-menu-cta::before { display: none; }
}
@media (max-width: 480px) {
  nav[aria-label="Основна навігація"] .logo { font-size: 1.2rem; }
}
</style>`;

/** 'journal/x/index.html' → '/journal/x/' */
export const urlOf = (rel) => '/' + rel.replace(/index\.html$/, '');

/**
 * The menu, with the current section marked. A post says which section it belongs to in its own
 * breadcrumb (Ф2 put the hub there), so a rubric post under /journal/ marks «Паркінсон», not «Журнал».
 */
export function menuHtml(rel, html = '') {
  const url = urlOf(rel);
  const crumb = [...html.matchAll(/"position"\s*:\s*2\s*,\s*"name"\s*:\s*"[^"]*"\s*,\s*"item"\s*:\s*"([^"]+)"/g)]
    .map((m) => m[1].replace('https://www.parkinsandr.tech', ''))[0];
  const byCrumb = crumb && MENU.find((item) => item.href === crumb);
  const current = byCrumb ?? MENU.filter((item) => url === item.href || url.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const items = MENU.map((item) => {
    const mark = item === current ? ' aria-current="page"' : '';
    const cls = item.cta ? ' class="site-menu-cta"' : '';
    return `    <li><a href="${item.href}"${cls}${mark}>${item.label}</a></li>`;
  }).join('\n');
  return `${START}\n  <ul class="site-menu">\n${items}\n  </ul>\n  ${END}`;
}

/** Put the menu inside the page's main nav, after the logo, and drop the generic «← На головну». */
export function inject(html, rel) {
  const nav = /<nav[^>]*aria-label="Основна навігація"[^>]*>[\s\S]*?<\/nav>/.exec(html);
  if (!nav) return null; // a page without the standard header (404) is left alone
  let block = nav[0];
  // the menu marks the section, so the old back link is one thing too many in a row that has to scroll
  block = block.replace(/\s*<a href="[^"]*" class="nav-back">[^<]*<\/a>/, '');
  block = block.includes(START)
    ? block.replace(new RegExp(`${START}[\\s\\S]*?${END}`), menuHtml(rel, html))
    : block.replace(/<\/nav>/, `  ${menuHtml(rel, html)}\n</nav>`);
  let out = html.slice(0, nav.index) + block + html.slice(nav.index + nav[0].length);
  // the same leading newline either way, so a second run is byte-identical
  out = STYLE_RE.test(out) ? out.replace(STYLE_RE, `\n${STYLE}`) : out.replace('</head>', `\n${STYLE}\n</head>`);
  return out;
}

function pages(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name.endsWith('.html')) out.push(relative(PUBLIC, p).split(sep).join('/'));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const changed = [];
  const skipped = [];
  for (const rel of pages(PUBLIC)) {
    const html = readFileSync(join(PUBLIC, rel), 'utf8');
    const next = inject(html, rel);
    if (next === null) {
      skipped.push(rel);
      continue;
    }
    if (next === html) continue;
    changed.push(rel);
    if (!check) writeFileSync(join(PUBLIC, rel), next, 'utf8');
  }
  console.log(`${check ? 'would update' : 'updated'} ${changed.length} page(s); skipped ${skipped.length} (${skipped.join(', ') || 'none'})`);
}
