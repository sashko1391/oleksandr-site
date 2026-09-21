#!/usr/bin/env node
// Generate public/feed.xml (RSS 2.0) from the journal + blog post HTML files.
// No build step, no deps. Post metadata comes from the Article JSON-LD block
// (parsed as JSON, not scraped) plus the canonical/description/og:image <meta>.
// Dates are validated and emitted in UTC RFC-822. Run standalone or from announce.mjs.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { HUB_MEMBERS } from './link-policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const SITE = 'https://www.parkinsandr.tech';
const AUTHOR = 'Олександр Кравченко';
const MAX_ITEMS = 30; // per feed: every feed carries up to the 30 newest posts of its section
const SECTIONS = [
  { dir: 'journal', fallbackCategory: 'Журнал' },
  { dir: 'blog', fallbackCategory: 'Блог' },
];

/**
 * Ф4: one feed per section on top of the site-wide feed. Membership is the hub manifest
 * (scripts/link-policy.mjs) — the same list the hub page shows, so a feed can never drift
 * from its section. The archive /blog/ and the commercial /services/ get no feed of their own.
 */
const SECTION_FEEDS = [
  {
    hub: 'parkinson/',
    description:
      'Рубрика «Паркінсон»: досвід пацієнта, розбори з джерелами й журналом виправлень. Не медична порада.',
  },
  {
    hub: 'code/',
    description: 'Devlog-и власних проєктів, AI-інструменти й розбори пошукової видимості з даними.',
  },
  {
    hub: 'creative/',
    description: 'Оповідання, байки, пісні та кліпи Олександра Кравченка.',
  },
  {
    hub: 'journal/',
    description: 'Есеї, щоденник, подорожі та оповідання — усі записи журналу, від найновіших.',
  },
];

/** Every feed the site publishes: the site-wide one first, then the sections. */
export const FEEDS = [
  {
    file: 'feed.xml',
    name: 'parkinsandr.tech',
    title: 'parkinsandr.tech — журнал і не тільки',
    link: `${SITE}/`,
    description: 'Есеї, оповідання, щоденники та статті Олександра Кравченка — розробка, життя, дорога.',
    members: null, // everything
  },
  ...SECTION_FEEDS.map(({ hub, description }) => {
    const manifest = HUB_MEMBERS[hub];
    if (!manifest) throw new Error(`no hub manifest for ${hub}`);
    return {
      file: `${hub}feed.xml`,
      name: manifest.name,
      title: `parkinsandr.tech — ${manifest.name}`,
      link: `${SITE}/${hub}`,
      description,
      members: new Set([...manifest.primary, ...manifest.also]),
    };
  }),
];
/** RSS 2.0 caps the channel image at 144×400 and assumes 88×31 when the size is not declared. */
export const LOGO = { path: 'images/rss-logo.png', width: 144, height: 144 };
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

/**
 * Strip code points illegal in XML 1.0 (keep tab/LF/CR); CDATA does not legalise them.
 * Char := #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF] — so U+FFFE/U+FFFF
 * and unpaired surrogates are out too (a lone surrogate is no code point at all).
 */
export function xmlSafe(s) {
  return String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
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

/**
 * Newest first. Three posts share 2026-07-13, so the tie-break matters: without it the comparator is
 * inconsistent (it answers -1 both ways) and the cutoff at MAX_ITEMS would be arbitrary.
 */
export function byDate(a, b) {
  const d = new Date(b.pubDate) - new Date(a.pubDate);
  if (d !== 0) return d;
  const [x, y] = [a.source ?? '', b.source ?? ''];
  return x < y ? -1 : x > y ? 1 : 0;
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
      const rel = `${dir}/${slug.name}/index.html`;
      const item = parsePost(readFileSync(file, 'utf8'), fallbackCategory, rel);
      if (item) items.push({ ...item, source: rel });
    }
  }
  items.sort(byDate);
  return items;
}

/** The items of one feed: its section's posts (or all of them), newest first, capped at MAX_ITEMS. */
export function itemsFor(feed, items) {
  const mine = feed.members ? items.filter((it) => feed.members.has(it.source)) : items;
  return mine.slice(0, MAX_ITEMS);
}

function enclosure(image) {
  if (!image) return '';
  const type = MIME[extname(pathOf(image)).toLowerCase()] || 'application/octet-stream';
  const local = localAsset(image);
  const length = local ? statSync(local).size : 0;
  return `\n      <enclosure url="${xmlEscape(image)}" type="${type}" length="${length}"/>`;
}

export function build(items, feed = FEEDS[0]) {
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
    <title>${xmlEscape(feed.title)}</title>
    <link>${xmlEscape(feed.link)}</link>
    <atom:link href="${xmlEscape(`${SITE}/${feed.file}`)}" rel="self" type="application/rss+xml"/>
    <description>${cdata(feed.description)}</description>
    <language>uk</language>
    <copyright>© ${new Date().getUTCFullYear()} ${AUTHOR}</copyright>
    <lastBuildDate>${now}</lastBuildDate>
    <image>
      <url>${SITE}/${LOGO.path}</url>
      <title>${xmlEscape(feed.title)}</title>
      <link>${xmlEscape(feed.link)}</link>
      <width>${LOGO.width}</width>
      <height>${LOGO.height}</height>
    </image>
${entries}
  </channel>
</rss>
`;
}

/**
 * Regenerate every feed. Nothing is written unless all of them have items, so a broken run cannot
 * leave the site with a half-updated set. Returns what was written, for the caller to log.
 * @returns {Array<{ feed: typeof FEEDS[number], count: number, newest: string }>}
 */
export function writeFeeds() {
  const all = collect();
  if (all.length === 0) throw new Error('no items collected — refusing to write empty feeds');
  const planned = FEEDS.map((feed) => ({ feed, items: itemsFor(feed, all) }));
  const empty = planned.filter((p) => p.items.length === 0).map((p) => p.feed.file);
  if (empty.length) throw new Error(`no items for ${empty.join(', ')} — nothing written`);
  return planned.map(({ feed, items }) => {
    const out = join(PUBLIC, feed.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, build(items, feed), 'utf8');
    return { feed, count: items.length, newest: items[0].pubDate };
  });
}

// Run only when executed directly (so tests can import the pure helpers above).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    for (const { feed, count, newest } of writeFeeds()) {
      console.log(`${feed.file}: ${count} items (newest ${newest})`);
    }
  } catch (e) {
    console.error(`feeds: ${e.message}`);
    process.exit(1);
  }
}
