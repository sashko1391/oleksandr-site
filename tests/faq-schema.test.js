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

/** Visible text: hidden containers dropped, entities and typography normalised so a quote style does not fail. */
const textOf = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>/g, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/g, ' ') // shown only without JS, so not the page a reader sees
    .replace(/<([a-z]+)[^>]*(?:\shidden(?=[\s>])|style="[^"]*display\s*:\s*none)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;|[«»"„“”]/g, '"').replace(/[’ʼ']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');

const normalise = (s) => s.replace(/ /g, ' ').replace(/[«»"„“”]/g, '"').replace(/[’ʼ']/g, "'")
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

/** FAQPage nodes anywhere in the JSON-LD, including inside a @graph. */
function faqNodes(data, out = []) {
  if (Array.isArray(data)) data.forEach((d) => faqNodes(d, out));
  else if (data && typeof data === 'object') {
    if ([].concat(data['@type'] ?? []).includes('FAQPage')) out.push(data);
    Object.values(data).forEach((v) => faqNodes(v, out));
  }
  return out;
}

const faqPages = pages.flatMap((p) => {
  const blocks = [...p.html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => faqNodes(JSON.parse(m[1])));
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

  it('every question and answer in the schema is on the page, and the answer belongs to its question', () => {
    for (const p of faqPages) {
      const text = textOf(p.html);
      for (const block of p.faq) {
        expect(block.mainEntity, `${p.rel}: FAQPage without questions`).toBeTruthy();
        for (const entity of [].concat(block.mainEntity)) {
          const question = normalise(entity.name);
          const answer = normalise(entity.acceptedAnswer.text);
          const qAt = text.indexOf(question);
          expect(qAt, `${p.rel}: question missing from the page — «${question}»`).toBeGreaterThan(-1);
          const aAt = text.indexOf(answer, qAt);
          expect(aAt, `${p.rel}: answer not found under its question — «${question}»`).toBeGreaterThan(-1);
          // the answer must sit between its question and the next one, not under a different heading
          const others = [].concat(block.mainEntity).map((e) => text.indexOf(normalise(e.name)))
            .filter((i) => i > qAt);
          const nextQuestion = others.length ? Math.min(...others) : text.length;
          expect(aAt, `${p.rel}: the answer to «${question}» appears under another question`)
            .toBeLessThan(nextQuestion);
        }
      }
    }
  });
});
