#!/usr/bin/env node
// Inject a single RSS <link rel="alternate"> into the <head> of every public HTML
// page (except 404). Idempotent: skips a page that already links /feed.xml.
// Anchors right after <link rel="canonical">, else before </head>.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TAG =
  '<link rel="alternate" type="application/rss+xml" title="RSS — parkinsandr.tech" href="/feed.xml">';

/** Recursively list every *.html under `dir`, skipping 404.html. */
export function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html') && name !== '404.html') out.push(p);
  }
  return out;
}

/** Insert the RSS <link>, or return null if already present in <head> / no anchor. */
export function injectInto(html) {
  const headMatch = html.match(/<head[\s>][\s\S]*?<\/head>/i);
  const head = headMatch ? headMatch[0] : '';
  // Precise skip: an rss-alternate link to /feed.xml already in <head>, any attr order / quote style.
  const isRssLink = (tag) =>
    /\brel\s*=\s*['"]alternate['"]/i.test(tag) &&
    /\btype\s*=\s*['"]application\/rss\+xml['"]/i.test(tag) &&
    /\bhref\s*=\s*['"]\/feed\.xml['"]/i.test(tag);
  if ((head.match(/<link\b[^>]*>/gi) || []).some(isRssLink)) return null;

  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  // Anchor after <link rel="canonical"> only when it lives inside <head>.
  const canonical = head.match(/([ \t]*)<link\s+rel="canonical"[^>]*>/i);
  if (canonical) {
    return html.replace(canonical[0], `${canonical[0]}${eol}${canonical[1]}${TAG}`);
  }
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `  ${TAG}${eol}</head>`);
  return null;
}

export function run() {
  let injected = 0;
  let skipped = 0;
  for (const file of htmlFiles(PUBLIC)) {
    const out = injectInto(readFileSync(file, 'utf8'));
    if (out == null) { skipped++; continue; }
    writeFileSync(file, out, 'utf8');
    injected++;
  }
  console.log(`RSS <link>: injected ${injected}, skipped ${skipped}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
