// A quoted testimonial has exactly one wording and a named author (rule 13 of AGENTS.md; owner's
// decision of 2026-09-20: the anonymous «Клієнт Atlas Store» quotes are gone, the other two stay).
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

/** The only two client quotes the site may show, with the author each belongs to. */
const CANON = [
  {
    author: 'Жанна Вихристенко',
    role: 'засновниця Академії сучасних освітян',
    text: '«Потрібна була платформа для 8 700+ педагогів — не просто сайт, а реєстр сертифікатів, каталог курсів, ' +
      'блог. Олександр зробив усе на Next.js, працює блискавично. Performance 100 в Lighthouse.»',
  },
  {
    author: 'Сергій П.',
    role: 'власник ресторану «Славутич»',
    text: '«Старий сайт ресторану ледве набирав PageSpeed 40. Олександр переніс усе за 5 днів — нічого не ' +
      'зламалось, бронювання через сайт зʼявились одразу. PageSpeed 95, мобільна версія ідеальна.»',
  },
];

const blocks = pages.flatMap((p) =>
  [...p.html.matchAll(/<div class="testimonial">([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => ({ rel: p.rel, html: m[1] })));

const textOf = (html) => html.match(/«[^»]+»/)?.[0] ?? '';
const authorOf = (html) => html.match(/<strong>([^<]+)<\/strong>/)?.[1]?.trim() ?? '';
const roleOf = (html) => html.match(/<span>([^<]+)<\/span>/)?.[1]?.trim() ?? '';

describe('testimonials', () => {
  it('appear on the author page and the four commercial pages that had them', () => {
    expect([...new Set(blocks.map((b) => b.rel))].sort()).toEqual([
      'pro-mene/index.html',
      'services/kyiv/index.html',
      'services/landing/index.html',
      'services/nextjs/index.html',
      'services/redesign/index.html',
    ]);
    expect(blocks).toHaveLength(10); // two quotes per page
  });

  it('every quote is one of the two canonical wordings, with its own author', () => {
    for (const b of blocks) {
      const canon = CANON.find((c) => c.author === authorOf(b.html));
      expect(canon, `${b.rel}: unknown author «${authorOf(b.html)}»`).toBeDefined();
      expect(textOf(b.html), `${b.rel}: ${canon.author} is quoted differently here`).toBe(canon.text);
      expect(roleOf(b.html), `${b.rel}: ${canon.author}`).toBe(canon.role);
    }
  });

  it('no anonymous client is quoted anywhere', () => {
    for (const b of blocks) {
      expect(authorOf(b.html), b.rel).not.toMatch(/^(Клієнт|Замовник)\b/);
    }
    for (const p of pages) {
      expect(p.html, `${p.rel} still quotes «Клієнт Atlas Store»`).not.toContain('<strong>Клієнт Atlas Store</strong>');
    }
  });

  it('the numbers in the quotes are backed by the cases they come from', () => {
    const ace = pages.find((p) => p.rel === 'projects/ace/index.html').html;
    const slavutych = pages.find((p) => p.rel === 'projects/slavutych/index.html').html;
    expect(ace, 'the ACE case must back «8 700+ педагогів»').toMatch(/8\s?700/);
    expect(ace, 'the ACE case must back «Performance 100» and say when it was measured')
      .toMatch(/Performance 100<\/strong> на desktop|<strong>Performance 100<\/strong>/);
    expect(ace, 'the ACE case must state the re-check').toMatch(/Перевірка \d{1,2} [\u0430-\u044f\u0456\u0457\u0454\u0491]+ 2026/);
    expect(slavutych, 'the Slavutych case must back «PageSpeed 40 → 95» with the method')
      .toMatch(/PageSpeed Insights[\s\S]{0,200}<strong>40<\/strong>[\s\S]{0,120}<strong>95<\/strong>/);
    expect(slavutych, 'the Slavutych case must back «за 5 днів»').toMatch(/<strong>5 днів<\/strong>/);
    expect(slavutych, 'the Slavutych case must state the re-check').toMatch(/Перевірка \d{1,2} [\u0430-\u044f\u0456\u0457\u0454\u0491]+ 2026/);
  });

  it('a speed number shown as a result card says when it was measured', () => {
    for (const p of pages) {
      for (const m of p.html.matchAll(/<div class="result-metric"><strong>([^<]+)<\/strong><span>([^<]*)<\/span>/g)) {
        if (!/PageSpeed|Performance|Lighthouse/i.test(m[1])) continue;
        expect(m[2], `${p.rel}: «${m[1]}» is shown without a date`).toMatch(/20\d\d/);
      }
    }
  });
});
