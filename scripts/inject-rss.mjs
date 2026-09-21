#!/usr/bin/env node
// Inject the RSS <link rel="alternate"> tags into the <head> of every public HTML page (except 404):
// the site-wide /feed.xml everywhere, plus the feed of the section a page belongs to (Ф4) — on the
// section's hub and on its posts. The section feed is listed FIRST, because a client that understands
// only one alternate should default to the topical feed on a topical page.
// Idempotent: skips a page that already links the feed in question. Anchors: a section feed before the
// first rss link, the site feed after the last one; failing that, after <link rel="canonical">, else
// before </head>. Commented-out and script-embedded markup is masked out before anything is decided.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { FEEDS } from './build-feed.mjs';
import { primaryHub } from './link-policy.mjs';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SITE_FEED = '/feed.xml';
const TAG =
  '<link rel="alternate" type="application/rss+xml" title="RSS — parkinsandr.tech" href="/feed.xml">';

/** The <link> tag that advertises one feed. */
export const tagFor = (feed) =>
  `<link rel="alternate" type="application/rss+xml" title="RSS — ${feed.name}" href="/${feed.file}">`;

/** Blank out comments, <script>, <style> and <template> — keeping offsets, so indexes still map to `html`. */
export function maskInert(html) {
  return html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, (m) =>
    m.replace(/[^\n\r]/g, ' ')
  );
}

/** One attribute of a tag, either quote style, or ''. */
export function attrOf(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return m ? m[2] : '';
}

/** Is `tag` an rss-alternate <link>, optionally to one specific href? Any attr order / quote style. */
function isRssLink(tag, href) {
  if (!/\brel\s*=\s*['"]alternate['"]/i.test(tag)) return false;
  if (!/\btype\s*=\s*['"]application\/rss\+xml['"]/i.test(tag)) return false;
  return href === undefined || attrOf(tag, 'href') === href;
}

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

/** Insert one feed's RSS <link>, or return null if already present in <head> / no anchor. */
export function injectInto(html, tag = TAG) {
  const masked = maskInert(html);
  const href = attrOf(tag, 'href');
  const headMatch = masked.match(/<head[\s>][\s\S]*?<\/head>/i);
  const head = headMatch ? headMatch[0] : '';
  const headAt = headMatch ? headMatch.index : 0;
  const links = [...head.matchAll(/<link\b[^>]*>/gi)];
  if (links.some((l) => isRssLink(l[0], href))) return null;

  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const indentAt = (at) => html.slice(html.lastIndexOf('\n', at - 1) + 1, at).match(/^[ \t]*/)[0];
  const rss = links.filter((l) => isRssLink(l[0]));
  const before = href !== SITE_FEED; // a section feed becomes the page's default alternate

  if (rss.length) {
    const anchor = before ? rss[0] : rss[rss.length - 1];
    const at = headAt + anchor.index;
    const indent = indentAt(at);
    return before
      ? html.slice(0, at - indent.length) + `${indent}${tag}${eol}` + html.slice(at - indent.length)
      : html.slice(0, at + anchor[0].length) + `${eol}${indent}${tag}` + html.slice(at + anchor[0].length);
  }
  const canonical = head.match(/<link\s+rel="canonical"[^>]*>/i);
  if (canonical) {
    const at = headAt + canonical.index;
    const indent = indentAt(at);
    return html.slice(0, at + canonical[0].length) + `${eol}${indent}${tag}` + html.slice(at + canonical[0].length);
  }
  const close = masked.search(/<\/head>/i);
  if (close !== -1) return html.slice(0, close) + `  ${tag}${eol}` + html.slice(close);
  return null;
}

const feedsByHub = new Map(FEEDS.slice(1).map((f) => [f.file.replace('feed.xml', ''), f]));

/**
 * Which section feed a page advertises: a hub advertises its own, a post advertises the feed of the hub
 * that owns it (`primary` in HUB_MEMBERS). Pages of sections without a feed (/blog/, /services/) get none.
 */
export function sectionFeedOf(rel) {
  const hub = rel.replace(/index\.html$/, '');
  if (rel.endsWith('index.html') && feedsByHub.has(hub)) return feedsByHub.get(hub);
  const owner = primaryHub().get(rel);
  return (owner && feedsByHub.get(owner.hub)) || null;
}

/**
 * Every rss alternate a page must carry, in the order they must appear: its section feed first (when the
 * page belongs to a section that has one), the site feed last. The whole decision lives here, so the
 * tests can check it against what is on disk — `run()` below is only a writer.
 */
export function tagsFor(rel) {
  if (rel === '404.html' || rel.endsWith('/404.html')) return [];
  const feed = sectionFeedOf(rel);
  return feed ? [tagFor(feed), TAG] : [TAG];
}

/** public/-relative path of a file under PUBLIC, with forward slashes. */
export const relOf = (file) => file.slice(PUBLIC.length + 1).split(sep).join('/');

export function run() {
  let injected = 0;
  let skipped = 0;
  for (const feed of FEEDS.slice(1)) {
    if (!existsSync(join(PUBLIC, dirname(feed.file), 'index.html'))) {
      throw new Error(`no hub page for ${feed.file}`);
    }
  }
  for (const file of htmlFiles(PUBLIC)) {
    // reversed: the site feed goes in first, then the section tag is inserted before it
    for (const tag of [...tagsFor(relOf(file))].reverse()) {
      const out = injectInto(readFileSync(file, 'utf8'), tag);
      if (out == null) { skipped++; continue; }
      writeFileSync(file, out, 'utf8');
      injected++;
    }
  }
  console.log(`RSS <link>: injected ${injected}, skipped ${skipped}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
