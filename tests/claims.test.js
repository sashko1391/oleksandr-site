// Every percentage a commercial page states as evidence must carry its source: an external link to the
// study, or an internal page of mine that shows the measurement (rule 13 of AGENTS.md).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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
const page = (rel) => pages.find((p) => p.rel === rel);

/** The pages that sell something — where an unsupported number does damage. */
const COMMERCIAL = pages.filter((p) => p.rel === 'index.html' || p.rel === 'pricing/index.html' ||
  p.rel.startsWith('services/'));

/**
 * Percentages that are not claims about the world, and therefore need no study behind them:
 * terms of work, and arithmetic examples that say out loud they are examples. Each must still exist.
 */
const NOT_EVIDENCE = [
  '50% передоплата перед стартом, 50% після приймання робіт', // terms
  'Працюю як ФОП (3% ЄП)', // tax regime
  'з націнкою +25-50% за пріоритет', // terms
  '100%</strong> робота за договором', // policy, not a measurement
  'якщо сайт конвертує 1% замість 3%', // labelled as an example with assumptions
];

/** My own measurements: allowed, but only while the page that shows the measurement still says so. */
const OWN_DATA = [
  { text: '60% Share of Voice в AI-пошуку за 5 тижнів', backedBy: 'blog/getting-cited-ai-poshuk/index.html', number: '60%' },
  { text: '80% трафіку', backedBy: 'projects/slavutych/index.html', number: '80%' },
];

const visible = (html) =>
  html.slice(html.indexOf('<main') === -1 ? 0 : html.indexOf('<main'))
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');

/** The block a number sits in — a paragraph, list item or card — so a link elsewhere does not count. */
function blockAround(html, index) {
  const start = Math.max(html.lastIndexOf('<p', index), html.lastIndexOf('<li', index),
    html.lastIndexOf('<div', index), html.lastIndexOf('<a ', index));
  const end = html.indexOf('</p>', index);
  return html.slice(start === -1 ? Math.max(0, index - 300) : start, end === -1 ? index + 300 : end + 4);
}

describe('claims with numbers', () => {
  it('finds the percentages to check', () => {
    const found = COMMERCIAL.flatMap((p) => [...visible(p.html).matchAll(/\d{1,3}(?:[.,]\d)?\s?%/g)]);
    expect(found.length).toBeGreaterThan(8);
  });

  it('each one is either sourced, a term of work, or my own measurement', () => {
    for (const p of COMMERCIAL) {
      const html = visible(p.html);
      for (const m of html.matchAll(/\d{1,3}(?:[.,]\d)?\s?%/g)) {
        const block = blockAround(html, m.index);
        const plain = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        if (/https?:\/\//.test(block)) continue; // the study is linked right there
        if (NOT_EVIDENCE.some((claim) => block.includes(claim) || plain.includes(claim.replace(/<[^>]+>/g, '')))) continue;
        const own = OWN_DATA.find((o) => plain.includes(o.text) || block.includes(o.text));
        expect(own, `${p.rel}: «${m[0]}» has no source — ${plain.trim().slice(0, 120)}`).toBeDefined();
      }
    }
  });

  it('my own measurements are still shown on the page that measured them', () => {
    for (const o of OWN_DATA) {
      const backing = page(o.backedBy);
      expect(backing, o.backedBy).toBeDefined();
      expect(backing.html, `${o.backedBy} no longer shows ${o.number}`).toContain(o.number);
    }
  });

  it('every exception in the manifest is still in use', () => {
    const all = COMMERCIAL.map((p) => p.html).join('\n');
    for (const claim of NOT_EVIDENCE) expect(all, `stale exception: ${claim}`).toContain(claim);
    for (const o of OWN_DATA) expect(all, `stale own-data entry: ${o.text}`).toContain(o.text);
  });

  /**
   * The figures as the studies report them, checked against the sources on 2026-09-20. Changing a number
   * here means going back to the study first — which is the point.
   */
  it('the market studies are named and quoted with the figures they report', () => {
    const landing = page('services/landing/index.html').html;
    const redesign = page('services/redesign/index.html').html;
    expect(landing).toContain('Akamai, State of Online Retail Performance, 2017');
    expect(landing).toContain('затримка всього на 100 мс знижує конверсію на 7%, а 2 секунди затримки подвоюють показник відмов');
    expect(landing).toContain('Unbounce Conversion Benchmark Report');
    expect(landing).toContain('Медіана конверсії лендингів у світі — 6,6%, а по галузях вона різниться від 3,8% до 12,3%');
    expect(redesign).toContain('Google, Think with Google, 2016');
    expect(redesign).toContain('40% людей ідуть зі сторінки, яка вантажиться довше за три секунди, а сесії з відмовою мали DOM ready на 55% повільніший');
    expect(redesign).toContain('затримка 100 мс знижує конверсію на 7%, а 2 секунди затримки подвоюють відмови');
  });

  it('no page promises a conversion rate or a payback period of its own', () => {
    for (const p of COMMERCIAL) {
      const plain = visible(p.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const UK = '[\u0430-\u044f\u0456\u0457\u0454\u0491]'; // \w does not cover Cyrillic in JS
      expect(plain, `${p.rel}: promises a conversion rate`).not.toMatch(new RegExp(`конверсі${UK}+ \\d{1,2}[-–]\\d{1,2}\\s?%`));
      expect(plain, `${p.rel}: promises a payback period`).not.toMatch(new RegExp(`окуп${UK}+ (себе |)за \\d`));
      expect(plain, `${p.rel}: promises leads per day`).not.toMatch(/\d[-–]\d додаткових заяв/);
    }
  });
});
