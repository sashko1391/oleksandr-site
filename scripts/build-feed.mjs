#!/usr/bin/env node
// Generate public/feed.xml (RSS 2.0) from the journal + blog post HTML files.
// No build step, no deps. Post metadata comes from the Article JSON-LD block
// (parsed as JSON, not scraped) plus the canonical/description/og:image <meta>.
// Dates are validated and emitted in UTC RFC-822. Run standalone or from announce.mjs.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const SITE = 'https://www.parkinsandr.tech';
const AUTHOR = 'Олександр Кравченко';
const MAX_ITEMS = 30;
const SECTIONS = [
  { dir: 'journal', fallbackCategory: 'Журнал' },
  { dir: 'blog', fallbackCategory: 'Блог' },
];
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

/** First capture group of `re` in `html`, or ''. */
function m(html, re) {
  const r = html.match(re);
  return r ? r[1] : '';
}

/** Decode the small set of HTML entities that appear in <meta> attribute text. */
export function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Strip code points illegal in XML 1.0 (keep tab/LF/CR); CDATA does not legalise them. */
export function xmlSafe(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Escape text for use in XML element/attribute content (for URLs, which are not CDATA-wrapped). */
export function xmlEscape(s) {
  return xmlSafe(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap text as CDATA, sanitising control chars and neutralising any ]]> breakout. */
export function cdata(s) {
  return `<![CDATA[${xmlSafe(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Strict YYYY-MM-DD → RFC-822 UTC. Rejects calendar-impossible dates (2026-02-31). */
export function rfc822(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return ''; // round-trip guard
  return d.toUTCString();
}

/** Does a JSON-LD node's @type include one of `types`? */
function hasType(node, types) {
  const t = node && node['@type'];
  const arr = Array.isArray(t) ? t : [t];
  return arr.some((x) => types.includes(x));
}

/** Recursively collect every object node from arbitrary array / @graph nesting (null-safe). */
function collectNodes(data, out) {
  if (Array.isArray(data)) {
    for (const x of data) collectNodes(x, out);
  } else if (data && typeof data === 'object') {
    out.push(data);
    if ('@graph' in data) collectNodes(data['@graph'], out);
  }
}

/** Find the Article/BlogPosting entity across all JSON-LD blocks (handles @graph, arrays, null). */
export function extractArticle(html) {
  const types = ['Article', 'BlogPosting', 'NewsArticle'];
  const re = /<script\b[^>]*\btype\s*=\s*['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
  for (const mt of html.matchAll(re)) {
    let data;
    try {
      data = JSON.parse(mt[1].trim());
    } catch {
      continue; // malformed block — skip, don't crash the whole feed
    }
    const nodes = [];
    collectNodes(data, nodes);
    const article = nodes.find((n) => hasType(n, types));
    if (article) return article; // deterministic: first Article in document order
  }
  return null;
}

/** URL → pathname (drops query/hash), or the input if not a URL. */
function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Resolve an og:image absolute URL to a local file under public/, or null. */
function localAsset(url) {
  if (!url.startsWith(SITE + '/')) return null;
  const p = join(PUBLIC, pathOf(url).replace(/^\//, ''));
  return existsSync(p) ? p : null;
}

/** Parse one post's index.html into a feed item, or null if it lacks required metadata. */
export function parsePost(html, fallbackCategory, file = '?') {
  const article = extractArticle(html);
  const raw = article && typeof article.datePublished === 'string' ? article.datePublished : '';
  // Accept only a clean date or an ISO datetime; reject "2026-07-13garbage".
  const datePublished = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(raw)?.[1] ?? '';
  const pubDate = rfc822(datePublished);
  const link = decode(m(html, /<link\s+rel="canonical"\s+href="([^"]+)"/));
  if (!pubDate || !link) {
    console.warn(`skip (missing ${!pubDate ? 'valid datePublished' : 'canonical'}): ${file}`);
    return null;
  }
  const title =
    (article && typeof article.headline === 'string' && article.headline) ||
    decode(m(html, /<title>([^<]*)<\/title>/));
  const description =
    (article && typeof article.description === 'string' && article.description) ||
    decode(m(html, /<meta\s+name="description"\s+content="([^"]*)"/)) ||
    decode(m(html, /<meta\s+property="og:description"\s+content="([^"]*)"/));
  const image = decode(m(html, /<meta\s+property="og:image"\s+content="([^"]+)"/));
  const category =
    (article && typeof article.articleSection === 'string' && article.articleSection) || fallbackCategory;
  return { title, link, description, image, category, pubDate };
}

export function collect() {
  const items = [];
  for (const { dir, fallbackCategory } of SECTIONS) {
    const base = join(PUBLIC, dir);
    if (!existsSync(base)) continue;
    for (const slug of readdirSync(base, { withFileTypes: true })) {
      if (!slug.isDirectory()) continue;
      const file = join(base, slug.name, 'index.html');
      if (!existsSync(file)) continue;
      const item = parsePost(readFileSync(file, 'utf8'), fallbackCategory, `${dir}/${slug.name}`);
      if (item) items.push(item);
    }
  }
  items.sort((a, b) => (new Date(a.pubDate) < new Date(b.pubDate) ? 1 : -1));
  return items.slice(0, MAX_ITEMS);
}

function enclosure(image) {
  if (!image) return '';
  const type = MIME[extname(pathOf(image)).toLowerCase()] || 'application/octet-stream';
  const local = localAsset(image);
  const length = local ? statSync(local).size : 0;
  return `\n      <enclosure url="${xmlEscape(image)}" type="${type}" length="${length}"/>`;
}

export function build(items) {
  const now = new Date().toUTCString();
  const entries = items
    .map(
      (it) => `    <item>
      <title>${cdata(it.title)}</title>
      <link>${xmlEscape(it.link)}</link>
      <guid isPermaLink="true">${xmlEscape(it.link)}</guid>
      <dc:creator>${cdata(AUTHOR)}</dc:creator>
      <category>${cdata(it.category)}</category>
      <pubDate>${it.pubDate}</pubDate>
      <description>${cdata(it.description)}</description>${enclosure(it.image)}
    </item>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>parkinsandr.tech — журнал і не тільки</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Есеї, оповідання, щоденники та статті Олександра Кравченка — розробка, життя, дорога.</description>
    <language>uk</language>
    <copyright>© ${new Date().getUTCFullYear()} ${AUTHOR}</copyright>
    <lastBuildDate>${now}</lastBuildDate>
    <image>
      <url>${SITE}/images/preview.jpg</url>
      <title>parkinsandr.tech</title>
      <link>${SITE}/</link>
    </image>
${entries}
  </channel>
</rss>
`;
}

// Run only when executed directly (so tests can import the pure helpers above).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const items = collect();
  if (items.length === 0) {
    console.error('feed.xml: no items collected — aborting');
    process.exit(1);
  }
  writeFileSync(join(PUBLIC, 'feed.xml'), build(items), 'utf8');
  console.log(`feed.xml: ${items.length} items (newest ${items[0]?.pubDate ?? '—'})`);
}
