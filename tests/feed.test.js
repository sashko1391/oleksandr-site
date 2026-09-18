import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decode, cdata, xmlEscape, xmlSafe, rfc822, extractArticle, parsePost, build, collect,
} from '../scripts/build-feed.mjs';
import { injectInto } from '../scripts/inject-rss.mjs';

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
    expect(items.length).toBe(Math.min(expected, 30));
    expect(items.length).toBeGreaterThan(0);
  });
  it('the written public/feed.xml links match the collected set', () => {
    const xml = readFileSync(join(process.cwd(), 'public', 'feed.xml'), 'utf8');
    const guids = [...xml.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((m) => m[1]);
    expect(new Set(guids)).toEqual(new Set(items.map((i) => i.link)));
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

describe('injectInto (inject-rss)', () => {
  const TAG = 'type="application/rss+xml"';
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
