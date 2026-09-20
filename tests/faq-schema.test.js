// FAQPage schema must repeat what the visitor actually reads: Google asks for it, and a question that
// exists only in JSON-LD is a claim nobody can check on the page (AGENTS.md, Schema section).
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

/** Visible text, with entities and typography normalised so a quote style does not fail the test. */
const textOf = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;|[«»"„“”]/g, '"').replace(/[’ʼ']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');

const normalise = (s) => s.replace(/ /g, ' ').replace(/[«»"„“”]/g, '"').replace(/[’ʼ']/g, "'")
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

const faqPages = pages.flatMap((p) => {
  const blocks = [...p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .filter((d) => d['@type'] === 'FAQPage');
  return blocks.length ? [{ ...p, faq: blocks }] : [];
});

describe('FAQ schema', () => {
  it('the pages that declare a FAQ are the ones that show one', () => {
    expect(faqPages.map((p) => p.rel).sort()).toEqual([
      'blog/chek-list-zamovlennya-sajtu/index.html',
      'blog/getting-cited-ai-poshuk/index.html',
      'blog/internal-linking/index.html',
      'blog/seo-bez-reklamy-keis-atlas/index.html',
      'blog/skilky-koshtuye-sajt/index.html',
      'blog/tilda-vs-webflow-vs-kastom/index.html',
      'blog/yak-zamovyty-sajt/index.html',
      'journal/parkinson-shcho-robyty/index.html',
      'journal/rannii-parkinsonizm/index.html',
      'pricing/index.html',
      'services/ai/index.html',
      'services/index.html',
      'services/kyiv/index.html',
      'services/landing/index.html',
      'services/nextjs/index.html',
      'services/redesign/index.html',
    ]);
  });

  it('every question and answer in the schema is on the page', () => {
    for (const p of faqPages) {
      const text = textOf(p.html);
      for (const block of p.faq) {
        for (const entity of block.mainEntity) {
          expect(text, `${p.rel}: question missing from the page — «${entity.name}»`)
            .toContain(normalise(entity.name));
          const answer = normalise(entity.acceptedAnswer.text);
          expect(text, `${p.rel}: answer differs from the page — «${answer.slice(0, 70)}…»`).toContain(answer);
        }
      }
    }
  });
});
