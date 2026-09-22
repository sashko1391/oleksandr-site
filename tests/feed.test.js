import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  decode, cdata, xmlEscape, xmlSafe, rfc822, extractArticle, parsePost, build, collect, itemsFor, byDate, writeFeeds, FEEDS, LOGO,
} from '../scripts/build-feed.mjs';
import { injectInto, tagFor, maskInert, attrOf, sectionFeedOf, tagsFor } from '../scripts/inject-rss.mjs';
import { HUB_MEMBERS } from '../scripts/link-policy.mjs';

const PUBLIC = join(process.cwd(), 'public');
const read = (rel) => readFileSync(join(PUBLIC, rel), 'utf8');
const guidsOf = (xml) => [...xml.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((m) => m[1]);

describe('rfc822', () => {
  it('emits UTC RFC-822 for a valid ISO date', () => {
    expect(rfc822('2026-07-13')).toBe('Mon, 13 Jul 2026 00:00:00 GMT');
  });
  it('rejects a calendar-impossible date (no silent rollover)', () => {
    expect(rfc822('2026-02-31')).toBe('');
    expect(rfc822('2026-13-01')).toBe('');
  });
  it('rejects a non-date / wrong shape', () => {
    expect(rfc822('not-a-date')).toBe('');
    expect(rfc822('2026-07-13T10:00:00Z')).toBe('');
  });
});

describe('decode', () => {
  it('decodes the entities in <meta> attribute text', () => {
    expect(decode('&quot;A&quot; &amp; &#39;B&#39; &lt;x&gt;')).toBe('"A" & \'B\' <x>');
  });
  it('decodes numeric references', () => {
    expect(decode('caf&#233;')).toBe('café'); // &#233; = precomposed é (U+00E9)
    expect(decode('&#8212;')).toBe('—');
  });
});

describe('xmlEscape', () => {
  it('escapes XML-significant chars in URLs', () => {
    expect(xmlEscape('https://x/?a=1&b=2<z>"')).toBe('https://x/?a=1&amp;b=2&lt;z&gt;&quot;');
  });
});

describe('cdata / xmlSafe', () => {
  it('wraps text', () => {
    expect(cdata('hi')).toBe('<![CDATA[hi]]>');
  });
  it('neutralises a ]]> breakout sequence', () => {
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
  });
  it('strips XML-1.0-illegal control chars (CDATA does not legalise them)', () => {
    expect(cdata('a\u0001b\u0008c')).toBe('<![CDATA[abc]]>');
    expect(xmlSafe('x\u0000y\u001Fz')).toBe('xyz');
  });
  it('keeps legal whitespace (tab/LF/CR)', () => {
    expect(xmlSafe('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
});

/** Every public HTML page, relative to public/ (404 included — it must not link a section feed either). */
function htmlPages(dir = PUBLIC, prefix = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...htmlPages(join(dir, e.name), `${prefix}${e.name}/`));
    else if (e.name.endsWith('.html')) out.push(`${prefix}${e.name}`);
  }
  return out;
}

const SAMPLE = `<!doctype html><head>
<title>Заголовок — суфікс</title>
<meta name="description" content="Опис із &quot;лапками&quot; та &amp;.">
<meta property="og:image" content="https://www.parkinsandr.tech/images/x-og.jpg">
<link rel="canonical" href="https://www.parkinsandr.tech/journal/x/">
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">{"@type":"Article","headline":"Чистий\\nзаголовок \\u263A","articleSection":"Есеї","datePublished":"2026-07-13","description":"JSON-LD опис"}</script>
</head><body></body>`;

describe('extractArticle', () => {
  it('finds the Article block among several and JSON-decodes escapes', () => {
    const a = extractArticle(SAMPLE);
    expect(a['@type']).toBe('Article');
    expect(a.headline).toBe('Чистий\nзаголовок ☺'); // \n and ☺ really decoded, not literal
  });
  it('handles @graph and @type arrays', () => {
    const g = `<script type="application/ld+json">{"@graph":[{"@type":["BlogPosting","CreativeWork"],"headline":"G","datePublished":"2026-01-01"}]}</script>`;
    expect(extractArticle(g).headline).toBe('G');
  });
  it('returns null when no Article block exists', () => {
    expect(extractArticle('<script type="application/ld+json">{"@type":"Person"}</script>')).toBeNull();
  });
  it('ignores a malformed JSON-LD block without throwing', () => {
    const bad = `<script type="application/ld+json">{oops</script>` + SAMPLE;
    expect(extractArticle(bad)['@type']).toBe('Article');
  });
});

describe('parsePost', () => {
  it('prefers Article JSON-LD fields, canonical + og:image from meta', () => {
    const it = parsePost(SAMPLE, 'Поза кодом');
    expect(it).toMatchObject({
      title: 'Чистий\nзаголовок ☺',
      link: 'https://www.parkinsandr.tech/journal/x/',
      image: 'https://www.parkinsandr.tech/images/x-og.jpg',
      category: 'Есеї',
      description: 'JSON-LD опис',
      pubDate: 'Mon, 13 Jul 2026 00:00:00 GMT',
    });
  });
  it('falls back to the section category when articleSection is absent', () => {
    const html = SAMPLE.replace('"articleSection":"Есеї",', '');
    expect(parsePost(html, 'Блог').category).toBe('Блог');
  });
  it('returns null without a valid datePublished', () => {
    const html = SAMPLE.replace('"datePublished":"2026-07-13",', '');
    expect(parsePost(html, 'Блог')).toBeNull();
  });
  it('returns null without a canonical link', () => {
    const html = SAMPLE.replace(/<link\s+rel="canonical"[^>]*>/, '');
    expect(parsePost(html, 'Блог')).toBeNull();
  });
});

describe('build', () => {
  const xml = build([parsePost(SAMPLE, 'Поза кодом')]);
  it('produces a self-referencing RSS 2.0 channel with dc:creator', () => {
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
    expect(xml).toContain('<atom:link href="https://www.parkinsandr.tech/feed.xml" rel="self"');
    expect(xml).toContain('<dc:creator><![CDATA[Олександр Кравченко]]></dc:creator>');
  });
  it('emits UTC pubDate + typed enclosure', () => {
    expect(xml).toContain('<pubDate>Mon, 13 Jul 2026 00:00:00 GMT</pubDate>');
    expect(xml).toContain('<enclosure url="https://www.parkinsandr.tech/images/x-og.jpg" type="image/jpeg"');
  });
  it('leaves no unescaped ampersand outside CDATA (well-formedness guard)', () => {
    const item = {
      title: 'T & <b>', link: 'https://x/?a=1&b=2', image: 'https://x/i.png?v=1&x',
      category: 'C', description: 'D & E', pubDate: 'Mon, 13 Jul 2026 00:00:00 GMT',
    };
    const out = build([item]).replace(/<!\[CDATA\[[\s\S]*?]]>/g, ''); // strip CDATA
    expect(out).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/); // no bare &
  });
});

describe('collect (integration against real posts)', () => {
  const items = collect();
  it('item count matches posts counted INDEPENDENTLY of parsePost', () => {
    // Independent signal: a post dir whose index.html carries both a datePublished
    // and a canonical — computed by grep, not by the function under test.
    let expected = 0;
    for (const dir of ['journal', 'blog']) {
      const base = join(process.cwd(), 'public', dir);
      if (!existsSync(base)) continue;
      for (const d of readdirSync(base, { withFileTypes: true })) {
        const f = join(base, d.name, 'index.html');
        if (!d.isDirectory() || !existsSync(f)) continue;
        const html = readFileSync(f, 'utf8');
        if (/"datePublished"\s*:\s*"\d{4}-\d{2}-\d{2}/.test(html) && /rel="canonical"/.test(html)) expected++;
      }
    }
    expect(items.length).toBe(expected); // collect() keeps everything; the 30-item cap is per feed
    expect(items.length).toBeGreaterThan(0);
    expect(itemsFor(FEEDS[0], items).length).toBe(Math.min(expected, 30));
  });
  it('the written public/feed.xml links match the collected set', () => {
    const guids = guidsOf(read('feed.xml'));
    expect(new Set(guids)).toEqual(new Set(itemsFor(FEEDS[0], items).map((i) => i.link)));
  });
  it('every collected item has the required fields', () => {
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.link).toMatch(/^https:\/\/www\.parkinsandr\.tech\//);
      expect(it.pubDate).toMatch(/GMT$/);
    }
  });
  it('is sorted newest-first', () => {
    const dates = items.map((i) => new Date(i.pubDate).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});


describe('xmlSafe — the XML 1.0 Char production', () => {
  it('drops U+FFFE / U+FFFF and unpaired surrogates, keeps real astral characters', () => {
    expect(xmlSafe('a￾b￿c')).toBe('abc');
    expect(xmlSafe('a\uD800b')).toBe('ab'); // lone high surrogate
    expect(xmlSafe('a\uDC00b')).toBe('ab'); // lone low surrogate
    expect(xmlSafe('a\u{1F600}b')).toBe('a\u{1F600}b'); // a valid pair survives
    expect(xmlSafe('a�b')).toBe('a�b'); // U+FFFD is a legal character
  });
});

describe('byDate', () => {
  it('is newest-first and consistent — equal dates fall back to the source path', () => {
    const a = { pubDate: 'Mon, 13 Jul 2026 00:00:00 GMT', source: 'journal/a/index.html' };
    const b = { pubDate: 'Mon, 13 Jul 2026 00:00:00 GMT', source: 'journal/b/index.html' };
    const c = { pubDate: 'Tue, 14 Jul 2026 00:00:00 GMT', source: 'journal/c/index.html' };
    expect(byDate(a, b)).toBeLessThan(0);
    expect(byDate(b, a)).toBeGreaterThan(0); // the old comparator answered -1 both ways
    expect(byDate(a, a)).toBe(0);
    expect([a, b, c].slice().sort(byDate)).toEqual([c, a, b]);
  });
  it('orders the real posts that share a date deterministically', () => {
    const items = collect();
    const sameDay = items.filter((i) => i.pubDate === 'Mon, 13 Jul 2026 00:00:00 GMT').map((i) => i.source);
    expect(sameDay.length, 'this guard needs posts that share a date').toBeGreaterThan(1);
    expect(sameDay).toEqual([...sameDay].sort());
  });
});

describe('section feeds (Ф4)', () => {
  const sections = FEEDS.slice(1);
  const all = collect();
  const dateOf = (file) => read(file).match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/)[1];
  const canonicalOf = (file) => read(file).match(/<link rel="canonical" href="([^"]+)"/)[1];

  /** What a feed must contain, computed from the manifest alone: the 30 newest of its section. */
  const expectedLinks = (hub) =>
    [...HUB_MEMBERS[hub].primary, ...HUB_MEMBERS[hub].also]
      .map((file) => ({ file, date: dateOf(file), link: canonicalOf(file) }))
      .sort((a, b) => (a.date === b.date ? (a.file < b.file ? -1 : 1) : a.date < b.date ? 1 : -1))
      .slice(0, 30)
      .map((x) => x.link);

  it('publishes one feed per personal section, and only those', () => {
    expect(sections.map((f) => f.file)).toEqual([
      'parkinson/feed.xml', 'code/feed.xml', 'creative/feed.xml', 'journal/feed.xml',
    ]);
    // the archive and the commercial hub stay out of the subscription surface
    expect(sections.some((f) => f.file.startsWith('blog/') || f.file.startsWith('services/'))).toBe(false);
  });

  it('each file holds the 30 newest posts its hub manifest lists — dates and canonicals read from the posts', () => {
    for (const feed of sections) {
      const hub = feed.file.replace('feed.xml', '');
      const expected = expectedLinks(hub);
      expect(expected.length, `${hub}: manifest is empty`).toBeGreaterThan(0);
      // both the committed file and what the generator would write now — a mutation in either is caught
      expect(guidsOf(read(feed.file)), `${hub}: the committed feed drifted from the manifest`).toEqual(expected);
      expect(itemsFor(feed, all).map((i) => i.link), `${hub}: the generator drifted from the manifest`)
        .toEqual(expected);
    }
  });

  it('every committed feed is byte-for-byte what the generator writes now (only the build time differs)', () => {
    const stamp = (xml) => xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, '<lastBuildDate/>');
    for (const feed of FEEDS) {
      expect(stamp(read(feed.file)), `${feed.file} is stale or hand-edited — rerun build-feed.mjs`)
        .toBe(stamp(build(itemsFor(feed, all), feed)));
    }
  });

  it('every section item is a real post of the site (no orphan subscription)', () => {
    const known = new Set(all.map((i) => i.link)); // the whole inventory, not the capped site feed
    for (const feed of sections) for (const g of guidsOf(read(feed.file))) expect(known).toContain(g);
  });

  it('each file is a valid self-referencing channel pointing at its own hub', () => {
    for (const feed of sections) {
      const xml = read(feed.file);
      expect(xml).toContain(`<atom:link href="https://www.parkinsandr.tech/${feed.file}" rel="self"`);
      expect(xml).toContain(`<link>${feed.link}</link>`);
      expect(xml).toContain(`<title>parkinsandr.tech — ${feed.name}</title>`);
      expect(xml.replace(/<!\[CDATA\[[\s\S]*?]]>/g, '')).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/);
      const dates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => new Date(m[1]).getTime());
      expect(dates, `${feed.file}: not newest-first`).toEqual([...dates].sort((a, b) => b - a));
    }
  });

  it('every item carries each required element exactly once', () => {
    for (const feed of FEEDS) {
      const items = read(feed.file).split('<item>').slice(1).map((chunk) => chunk.split('</item>')[0]);
      expect(items.length, `${feed.file}: item count`).toBe(itemsFor(feed, all).length);
      for (const item of items) {
        for (const tag of ['title', 'link', 'guid', 'dc:creator', 'category', 'pubDate', 'description']) {
          expect((item.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length, `${feed.file}: <${tag}>`).toBe(1);
        }
      }
      const guids = guidsOf(read(feed.file));
      expect(new Set(guids).size, `${feed.file}: duplicate guid`).toBe(guids.length);
    }
  });

  it('itemsFor filters by membership, keeps order and caps at 30', () => {
    const mk = (n) => ({ link: `https://x/${n}`, source: `journal/${n}/index.html`, pubDate: '' });
    const many = Array.from({ length: 35 }, (_, i) => mk(i));
    const feed = { members: new Set(many.map((i) => i.source)) };
    expect(itemsFor(feed, many)).toHaveLength(30);
    expect(itemsFor(feed, many)[0]).toBe(many[0]); // order preserved, oldest dropped
    const one = { members: new Set(['journal/3/index.html']) };
    expect(itemsFor(one, many).map((i) => i.source)).toEqual(['journal/3/index.html']);
    expect(itemsFor({ members: null }, many)).toHaveLength(30);
  });

  it('build() renders the channel of the feed it is given', () => {
    const feed = sections[0];
    const xml = build([parsePost(SAMPLE, 'Поза кодом')], feed);
    expect(xml).toContain(`<title>${feed.title}</title>`);
    expect(xml).toContain(`<link>${feed.link}</link>`);
    expect(xml).toContain(`<atom:link href="https://www.parkinsandr.tech/${feed.file}" rel="self"`);
    expect(xml).toContain(`<description><![CDATA[${feed.description}]]></description>`);
    // RSS 2.0: the channel image mirrors the channel's own title and link
    const image = xml.match(/<image>([\s\S]*?)<\/image>/)[1];
    expect(image).toContain(`<title>${feed.title}</title>`);
    expect(image).toContain(`<link>${feed.link}</link>`);
  });

  it('the channel logo exists and its declared size is the file’s real size', () => {
    const png = readFileSync(join(PUBLIC, LOGO.path));
    expect(png.subarray(1, 4).toString('latin1'), 'not a PNG').toBe('PNG');
    // IHDR: width and height are the two big-endian uint32 at byte 16
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([LOGO.width, LOGO.height]);
    expect(LOGO.width, 'RSS 2.0 caps the channel image at 144 wide').toBeLessThanOrEqual(144);
    expect(LOGO.height, 'RSS 2.0 caps the channel image at 400 tall').toBeLessThanOrEqual(400);
    for (const feed of FEEDS) {
      const image = read(feed.file).match(/<image>([\s\S]*?)<\/image>/)[1];
      expect(image).toContain(`<url>https://www.parkinsandr.tech/${LOGO.path}</url>`);
      expect(image).toContain(`<width>${LOGO.width}</width>`);
      expect(image).toContain(`<height>${LOGO.height}</height>`);
    }
  });

  it('writeFeeds() puts every feed in place, and its output is what is committed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'feeds-'));
    try {
      const written = writeFeeds(dir);
      expect(written.map((w) => w.feed.file)).toEqual(FEEDS.map((f) => f.file));
      const stamp = (xml) => xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, '');
      for (const feed of FEEDS) {
        const fresh = readFileSync(join(dir, feed.file), 'utf8');
        expect(stamp(fresh), `${feed.file}: committed file differs from a fresh run`)
          .toBe(stamp(read(feed.file)));
      }
      // nothing half-written is left behind
      expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('every feed is well-formed XML — tags close, and they close in order', () => {
    // no XML parser in the standard library, so: a tag stack over the real files
    const check = (xml) => {
      const stack = [];
      const body = xml.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?]]>/g, '');
      for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
        const [, closing, name, selfClosing] = m;
        if (selfClosing) continue;
        if (closing) {
          if (stack.pop() !== name) return `unbalanced </${name}>`;
        } else stack.push(name);
      }
      return stack.length ? `never closed: ${stack.join(', ')}` : null;
    };
    for (const feed of FEEDS) expect(check(read(feed.file)), feed.file).toBeNull();
    // the checker must actually catch a broken document
    expect(check('<rss><channel><item></itemm></channel></rss>')).toMatch(/unbalanced/);
    expect(check('<rss><channel></channel>')).toMatch(/never closed/);
  });

  it('collect() tags every item with the post file it came from', () => {
    for (const item of all) {
      expect(item.source).toMatch(/^(journal|blog)\/[^/]+\/index\.html$/);
      expect(existsSync(join(PUBLIC, item.source))).toBe(true);
    }
  });
});

describe('feed autodiscovery', () => {
  const head = (rel) => maskInert(read(rel)).match(/<head[\s>][\s\S]*?<\/head>/i)[0];
  /** The rss alternates of a page, in document order, as [href, …] — masked markup does not count. */
  const alternates = (rel) =>
    (head(rel).match(/<link\b[^>]*>/gi) || [])
      .filter((t) => /rel\s*=\s*["']alternate["']/i.test(t) && /application\/rss\+xml/i.test(t))
      .map((t) => attrOf(t, 'href'));

  it('every indexable page advertises the site feed exactly once', () => {
    for (const rel of htmlPages().filter((r) => r !== '404.html')) {
      expect(alternates(rel).filter((h) => h === '/feed.xml'), rel).toHaveLength(1);
    }
  });

  it('a page advertises the feed of the section that owns it — and no other section feed', () => {
    for (const rel of htmlPages()) {
      const feed = rel === '404.html' ? null : sectionFeedOf(rel);
      const section = alternates(rel).filter((h) => h !== '/feed.xml');
      expect(section, `${rel}: section alternates`).toEqual(feed ? [`/${feed.file}`] : []);
    }
  });

  it('what is on disk is exactly what the injector plans for every page', () => {
    for (const rel of htmlPages()) {
      const planned = tagsFor(rel).map((t) => attrOf(t, 'href'));
      expect(alternates(rel), `${rel}: <head> does not match the plan — rerun inject-rss.mjs`).toEqual(planned);
      // and re-running would change nothing
      for (const tag of tagsFor(rel)) expect(injectInto(read(rel), tag), `${rel}: not idempotent`).toBeNull();
    }
  });

  it('the plan itself follows the manifest: hubs, their posts, and nothing else', () => {
    const planned = htmlPages().filter((rel) => tagsFor(rel).length > 1);
    const expected = htmlPages().filter((rel) => {
      const hub = rel.replace(/index\.html$/, '');
      const isHub = FEEDS.slice(1).some((f) => f.file === `${hub}feed.xml`);
      return isHub || (sectionFeedOf(rel) !== null && /^(journal|blog)\//.test(rel));
    });
    expect(planned.sort()).toEqual(expected.sort());
    expect(planned).toHaveLength(25); // 4 hubs + 18 journal posts + 3 blog posts owned by /code/
    expect(tagsFor('404.html'), 'the 404 page carries no feed at all').toEqual([]);
  });

  it('the section feed comes first, so a one-feed client defaults to the topical one', () => {
    const withBoth = htmlPages().filter((rel) => alternates(rel).length > 1);
    expect(withBoth.length, 'no page advertises two feeds at all').toBe(25); // 4 hubs + 21 posts
    for (const rel of withBoth) {
      expect(alternates(rel)[alternates(rel).length - 1], `${rel}: the site feed must be last`).toBe('/feed.xml');
      expect(alternates(rel)[0]).toBe(`/${sectionFeedOf(rel).file}`);
    }
  });

  it('sectionFeedOf follows the hub manifest: a post gets the feed of its primary hub', () => {
    expect(sectionFeedOf('parkinson/index.html').file).toBe('parkinson/feed.xml');
    expect(sectionFeedOf('journal/hoverla/index.html').file).toBe('parkinson/feed.xml'); // owned by the rubric
    expect(sectionFeedOf('journal/velozaizd/index.html').file).toBe('journal/feed.xml');
    expect(sectionFeedOf('journal/kabachok-starosta/index.html').file).toBe('creative/feed.xml');
    expect(sectionFeedOf('blog/jarvis-ai-assistant/index.html').file).toBe('code/feed.xml');
    expect(sectionFeedOf('blog/react-vs-tilda/index.html'), 'a /services/ post has no feed').toBeNull();
    expect(sectionFeedOf('blog/index.html'), 'the archive has no feed of its own').toBeNull();
    expect(sectionFeedOf('index.html'), 'the homepage is not a section').toBeNull();
  });

  it('each hub has a visible link to its feed, not only the <head> tag', () => {
    for (const feed of FEEDS.slice(1)) {
      const hub = feed.file.replace('feed.xml', 'index.html');
      const body = maskInert(read(hub)).replace(/<head[\s>][\s\S]*?<\/head>/i, '');
      const links = [...body.matchAll(/<a\b[^>]*>/gi)].map((m) => attrOf(m[0], 'href'));
      expect(links, `${hub}: no visible subscribe link`).toContain(`/${feed.file}`);
    }
  });
});

describe('injectInto (inject-rss)', () => {
  const TAG = 'type="application/rss+xml"';
  const TAGS = { site: tagFor(FEEDS[0]) };
  const page = (head) => `<!doctype html><head>\n${head}\n</head><body></body>`;

  it('inserts after canonical, inside head', () => {
    const out = injectInto(page('<link rel="canonical" href="https://x/">'));
    expect(out).toContain(TAG);
    expect(out.indexOf('canonical')).toBeLessThan(out.indexOf('rss+xml'));
  });
  it('inserts before </head> when there is no canonical', () => {
    const out = injectInto(page('<title>x</title>'));
    expect(out).toContain(TAG);
    expect(out.indexOf('rss+xml')).toBeLessThan(out.indexOf('</head>'));
  });
  it('is idempotent — skips a page that already has the double-quoted link', () => {
    const once = injectInto(page('<link rel="canonical" href="https://x/">'));
    expect(injectInto(once)).toBeNull();
  });
  it('recognises an existing single-quoted rss link (no duplicate)', () => {
    const single = page(`<link rel='alternate' type='application/rss+xml' href='/feed.xml'>`);
    expect(injectInto(single)).toBeNull();
  });

  it('puts a section feed BEFORE the site feed and leaves the site feed alone', () => {
    const feed = FEEDS[1];
    const withSite = injectInto(page('<link rel="canonical" href="https://x/">'));
    const out = injectInto(withSite, tagFor(feed));
    expect(out).toContain(tagFor(feed));
    expect((out.match(/href="\/feed\.xml"/g) || []).length).toBe(1);
    expect(out.indexOf(`/${feed.file}"`)).toBeLessThan(out.indexOf('"/feed.xml"'));
    expect(out).toMatch(/<link rel="canonical"[^>]*>\n/); // canonical keeps its own line
    expect(injectInto(out, tagFor(feed)), 'second run must be a no-op').toBeNull();
  });

  it('accepts a single-quoted tag and reads its href', () => {
    const feed = FEEDS[1];
    const single = `<link rel='alternate' type='application/rss+xml' title='RSS' href='/${feed.file}'>`;
    const out = injectInto(page('<link rel="canonical" href="https://x/">'), single);
    expect(out).toContain(single);
    expect(injectInto(out, single), 'the href must be recognised in single quotes too').toBeNull();
    expect(injectInto(out, tagFor(feed)), 'same feed, other quote style — still a duplicate').toBeNull();
  });

  it('ignores a commented-out or script-embedded rss link', () => {
    const commented = page(`<link rel="canonical" href="https://x/">\n<!-- ${TAGS.site} -->`);
    expect(injectInto(commented), 'a comment is not a link').not.toBeNull();
    const scripted = page(
      `<link rel="canonical" href="https://x/">\n<script>document.write('${TAGS.site}')</script>`
    );
    const out = injectInto(scripted);
    expect(out, 'markup inside <script> is not a link').not.toBeNull();
    // and the real tag lands after the canonical, not inside the script
    expect(out.indexOf('canonical')).toBeLessThan(out.indexOf('rel="alternate"'));
  });

  it('does not mistake a plain href="/feed.xml" for an rss alternate', () => {
    const anchorOnly = page('<link rel="canonical" href="https://x/">');
    const withAnchor = anchorOnly.replace('</head>', '<link rel="preload" href="/feed.xml"></head>');
    expect(injectInto(withAnchor)).toContain('rel="alternate"');
  });

  it('tells two feeds apart — a page with the site feed still gets the section one', () => {
    const only = page('<link rel="alternate" type="application/rss+xml" href="/feed.xml">');
    expect(injectInto(only, tagFor(FEEDS[1]))).toContain(`/${FEEDS[1].file}`);
    expect(injectInto(only)).toBeNull();
  });

  it('does not inject when there is no <head> (canonical only in body)', () => {
    expect(injectInto('<html><body><link rel="canonical" href="https://x/"></body></html>')).toBeNull();
  });
  it('preserves CRLF line endings in both branches', () => {
    const crlf = '<!doctype html><head>\r\n<link rel="canonical" href="https://x/">\r\n</head>';
    const out = injectInto(crlf);
    expect(out).toContain(`${TAG}`);
    expect(out).not.toMatch(/[^\r]\n/); // no bare LF introduced
  });
});
