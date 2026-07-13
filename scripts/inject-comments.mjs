#!/usr/bin/env node
// Injects the comments block into journal + blog articles (18 pages).
// Anchor: insert right before </article> (present on all targets → comments render last).
// Idempotent (skips pages already carrying #comments) and fail-fast (never silently skips).
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const files = [
  ...globSync('public/journal/*/index.html'),
  ...globSync('public/blog/*/index.html'),
].sort();

const ANCHOR = '</article>';
let injected = 0, already = 0;
const failures = [];

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  if (html.includes('id="comments"')) { already++; continue; }

  const idx = html.lastIndexOf(ANCHOR);
  if (idx === -1) { failures.push(file); continue; }

  // slug = path between public/ and /index.html  →  'journal/vira-i-religiya'
  const slug = file.replace(/^public\//, '').replace(/\/index\.html$/, '');
  const block =
    `  <section id="comments" data-slug="${slug}" aria-label="Коментарі"></section>\n` +
    `  <script src="/js/comments.v1.js" defer></script>\n`;

  const out = html.slice(0, idx) + block + html.slice(idx);
  writeFileSync(file, out);
  injected++;
}

console.log(`targets=${files.length} injected=${injected} already=${already} failed=${failures.length}`);
if (failures.length) {
  console.error('FAIL — no </article> anchor in:\n  ' + failures.join('\n  '));
  process.exit(1);
}
