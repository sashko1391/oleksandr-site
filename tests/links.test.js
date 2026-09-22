import { describe, it, expect } from 'vitest';
import { urlOf, fileOf, resolveRef, parsePage, ldIds, validate, loadSite } from '../scripts/check-links.mjs';
import { SITE, PHASES, CURRENT_PHASE, PERSONAL_CONTACT, HUB_MEMBERS, primaryHub } from '../scripts/link-policy.mjs';

// Fixtures: a minimal valid page (own canonical) and a site of such pages plus extra asset files.
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const page = (rel, body = '') => ({
  rel,
  html: `<html><head><link rel="canonical" href="${SITE}${urlOf(rel)}"></head><body>${body}</body></html>`,
});
const site = (pages, assets = []) => ({
  pages,
  files: new Set([...pages.map((p) => p.rel), ...assets]),
  virtual: new Set(['/js/script.js']),
});
const crumb = (name, item, position = 2) =>
  ld({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: `${SITE}/` },
      { '@type': 'ListItem', position, name, item },
    ],
  });
const INTEGRITY_ONLY = { homeAnchors: [] };
const rules = (s, policy = INTEGRITY_ONLY) => validate(s, policy).map((e) => e.rule);

describe('urlOf / fileOf', () => {
  it.each([
    ['index.html', '/'],
    ['journal/x/index.html', '/journal/x/'],
    ['404.html', '/404.html'],
  ])('urlOf(%s) = %s', (rel, url) => expect(urlOf(rel)).toBe(url));

  it.each([
    ['/', 'index.html'],
    ['/journal/x/', 'journal/x/index.html'],
    ['/images/a.webp', 'images/a.webp'],
  ])('fileOf(%s) = %s', (path, file) => expect(fileOf(path)).toBe(file));
});

describe('resolveRef', () => {
  const ok = (path, fragment = '', extra = {}) => ({ path, fragment, canonicalOrigin: true, canonicalPath: true, ...extra });

  it.each([
    ['/journal/x/', '/', ok('/journal/x/')],
    ['images/a.webp', '/', ok('/images/a.webp')],
    ['../y/', '/journal/x/', ok('/journal/y/')],
    [`${SITE}/pro-mene/#author`, '/', ok('/pro-mene/', 'author')],
    ['//www.parkinsandr.tech/x/', '/', ok('/x/')],
    ['https://parkinsandr.tech/x/', '/', ok('/x/', '', { canonicalOrigin: false })],
    ['http://www.parkinsandr.tech/x/', '/', ok('/x/', '', { canonicalOrigin: false })],
    ['/x/?utm_source=a#a%20b', '/', ok('/x/', 'a b')],
    ['/%70ricing/', '/', ok('/pricing/', '', { canonicalPath: false })],
    ['/journal%2Fx/', '/', ok('/journal/x/', '', { canonicalPath: false })],
    ['/%D0%B0/', '/', ok('/а/')],
  ])('%s from %s', (value, from, expected) => expect(resolveRef(value, from)).toEqual(expected));

  it.each(['https://example.com/', '//cdn.example.com/a.js', 'mailto:a@b.c', 'tel:7333', 'javascript:void(0)', 'data:font/woff2;base64,AA', PERSONAL_CONTACT])(
    'ignores a non-site reference: %s',
    (value) => expect(resolveRef(value, '/')).toBeNull()
  );

  it.each(['/%E0%A4%A/', 'https://[bad/'])('flags a malformed URL: %s', (value) =>
    expect(resolveRef(value, '/')).toEqual({ malformed: true })
  );
});

describe('parsePage', () => {
  const values = (html) => parsePage(html).refs.map((r) => r.value);

  it('skips <script>/<style>/<textarea> bodies and HTML comments but keeps the tags themselves', () => {
    const html = [
      '<script src="/js/a.js"></script><script>const s = \'<a href="/nope/">\';</script>',
      '<style>.x::after { content: \'<a href="/nope/">\' }</style>',
      '<textarea><a href="/nope/"></textarea><!-- <a href="/gone/"> -->',
    ].join('');
    expect(values(html)).toEqual(['/js/a.js']);
  });

  it('reads any quote style and attribute order; ">" inside a value does not end the tag', () => {
    const html = `<a class="x" href='/a/'>1</a><a href=/b/>2</a><a title="1 > 0" href="/c/">3</a>`;
    expect(values(html)).toEqual(['/a/', '/b/', '/c/']);
  });

  it('reads src, srcset and xlink:href', () => {
    expect(values('<img src="/a.webp" srcset="/a.webp 1x, /b.webp 2x" alt=""><svg><use xlink:href="#i"></use></svg>'))
      .toEqual(['/a.webp', '/a.webp', '/b.webp', '#i']);
  });

  it.each([
    ['/a.webp 1x,/b.webp 2x', ['/a.webp', '/b.webp']],
    ['/a.webp, /b.webp 480w', ['/a.webp', '/b.webp']],
    ['data:image/svg+xml,%3Csvg%3E 1x, /b.webp 2x', ['data:image/svg+xml,%3Csvg%3E', '/b.webp']],
  ])('parses srcset "%s" by the spec, not by every comma', (srcset, urls) => {
    expect(values(`<img srcset="${srcset}" alt="">`)).toEqual(urls);
  });

  it('reads CSS url() in <style> and style="" — quoted or not, outside CSS comments', () => {
    const html = `<style>/* url(/old.woff2) */ @font-face { src: url("/f/a.woff2") } .b { background: url(/i/b.webp) }</style>` +
      `<div style="background-image: url('/i/c.webp')"></div>`;
    expect(values(html)).toEqual(['/f/a.woff2', '/i/b.webp', '/i/c.webp']);
  });

  it('takes <meta content> only when it is an absolute URL', () => {
    const html = `<meta name="viewport" content="width=device-width"><meta property="og:image" content="${SITE}/images/a.jpg">`;
    expect(values(html)).toEqual([`${SITE}/images/a.jpg`]);
  });

  it('takes absolute JSON-LD values except entity @id, plus item.@id; flags relative URL properties', () => {
    const html = ld({
      '@id': `${SITE}/#business`,
      url: `${SITE}/`,
      name: 'Головна',
      image: [`${SITE}/a.jpg`, 'images/b.jpg'],
      email: 'mailto:a@b.c',
      sameAs: 'tg://resolve?domain=x',
      author: { '@id': `${SITE}/pro-mene/#author` },
      itemListElement: [{ position: 1, item: { '@id': `${SITE}/x/`, name: 'X' } }],
    });
    expect(parsePage(html).refs).toEqual([
      { value: `${SITE}/`, where: 'JSON-LD url' },
      { value: `${SITE}/a.jpg`, where: 'JSON-LD image' },
      { value: 'images/b.jpg', where: 'JSON-LD image', relative: true },
      { value: `${SITE}/x/`, where: 'JSON-LD item.@id' },
    ]);
  });

  it('collects id attributes (not data-id) and reports duplicates', () => {
    const p = parsePage('<div data-id="x" id="y"></div><div id="chat"></div><section id="chat"></section>');
    expect([...p.ids]).toEqual(['y', 'chat']);
    expect(p.duplicateIds).toEqual(['chat']);
  });

  it('reads anchor text without inner tags (quote-aware), with entities decoded', () => {
    const html = '<a href="/x/"><b>напишіть</b>&nbsp; мені</a><a href="/y/">Обговорити проєкт &rarr;</a>' +
      '<a href="/z/"><span title="1 > 0">Обговорити</span> проєкт</a>';
    expect(parsePage(html).anchors).toEqual([
      { href: '/x/', text: 'напишіть мені' },
      { href: '/y/', text: 'Обговорити проєкт →' },
      { href: '/z/', text: 'Обговорити проєкт' },
    ]);
  });
});

describe('validate — integrity (layer A)', () => {
  const home = (body = '') => page('index.html', body);
  const post = page('journal/x/index.html', '<h2 id="faq">FAQ</h2>');

  it('passes a clean site', () => {
    const body = [
      '<a href="/journal/x/">1</a>',
      '<a href="/journal/x/#faq">2</a>',
      '<a href="#own" id="own">3</a>',
      '<a href="#">4</a>',
      '<a href="mailto:a@b.c">5</a>',
      '<a href="https://example.com/">6</a>',
      '<img src="images/a.webp" alt="">',
      '<script src="/js/script.js"></script>',
      '<style>@font-face { src: url(/fonts/a.woff2) } .i { background: url("data:image/svg+xml,<svg/>") }</style>',
      ld({ '@graph': [{ '@type': 'BreadcrumbList', itemListElement: [{ position: 1, item: { '@id': `${SITE}/journal/x/` } }] }] }),
    ].join('');
    expect(validate(site([home(body), post], ['images/a.webp', 'fonts/a.woff2']), INTEGRITY_ONLY)).toEqual([]);
  });

  it.each([
    ['a broken link', '<a href="/nope/">x</a>', ['broken-link']],
    ['a directory link without trailing slash', '<a href="/journal/x">x</a>', ['missing-trailing-slash']],
    ['an explicit index.html', '<a href="/journal/x/index.html">x</a>', ['non-canonical-path']],
    ['a percent-encoded plain character', '<a href="/%6Aournal/x/">x</a>', ['non-canonical-path']],
    ['an encoded path separator', '<a href="/journal%2Fx/">x</a>', ['non-canonical-path']],
    ['a missing anchor on another page', '<a href="/journal/x/#nope">x</a>', ['missing-anchor']],
    ['a missing same-page anchor', '<a href="#nope">x</a>', ['missing-anchor']],
    ['a missing SVG symbol', '<svg><use xlink:href="#nope"></use></svg>', ['missing-anchor']],
    ['a fragment on a non-HTML file', '<a href="/feed.xml#x">x</a>', ['fragment-target']],
    ['a non-www origin', '<a href="https://parkinsandr.tech/journal/x/">x</a>', ['non-canonical-origin']],
    ['malformed percent-encoding', '<a href="/%E0%A4%A/">x</a>', ['malformed-url']],
    ['a broken image', '<img src="/images/nope.webp" alt="">', ['broken-link']],
    ['a broken font in <style>', '<style>@font-face { src: url(/fonts/nope.woff2) }</style>', ['broken-link']],
    ['a broken image in style=""', '<div style="background: url(/images/nope.webp)"></div>', ['broken-link']],
    ['a broken og:image', `<meta property="og:image" content="${SITE}/images/nope.jpg">`, ['broken-link']],
    ['a JSON-LD link to a missing anchor', crumb('X', `${SITE}/journal/x/#nope`), ['missing-anchor']],
    ['a JSON-LD link inside @graph', ld({ '@graph': [{ url: `${SITE}/nope/` }] }), ['broken-link']],
    ['a breadcrumb item object to a missing page', ld({ itemListElement: [{ position: 1, item: { '@id': `${SITE}/nope/` } }] }), ['broken-link']],
    ['a relative JSON-LD URL', ld({ '@type': 'Article', image: 'images/a.jpg' }), ['relative-json-ld-url']],
    ['malformed JSON-LD', '<script type="application/ld+json">{"a": }</script>', ['json-ld-parse']],
    ['a duplicate id', '<div id="chat"></div><section id="chat"></section>', ['duplicate-id']],
    ['a <base> tag', '<base href="/">', ['base-tag']],
  ])('flags %s', (_, body, expected) => {
    expect(rules(site([home(body), post], ['feed.xml']))).toEqual(expected);
  });

  it.each([
    ['missing', '<html><head></head><body></body></html>'],
    ['pointing at another page', `<html><head><link rel="canonical" href="${SITE}/journal/x/"></head></html>`],
    ['duplicated', `<html><head><link rel="canonical" href="${SITE}/"><link rel="canonical" href="${SITE}/"></head></html>`],
  ])('flags a canonical that is %s', (_, html) => {
    expect(rules(site([{ rel: 'index.html', html }, post]))).toEqual(['canonical']);
  });

  it('does not require a canonical on a noindex page', () => {
    const html = '<html><head><meta name="robots" content="noindex"></head><body><a href="/">home</a></body></html>';
    expect(rules(site([home(), { rel: '404.html', html }]))).toEqual([]);
  });

  it('does not treat an entity @id as a link', () => {
    expect(rules(site([home(ld({ '@id': `${SITE}/#business`, author: { '@id': `${SITE}/pro-mene/#author` } }))]))).toEqual([]);
  });
});

describe('validate — migration policy (layer B)', () => {
  const home = page('index.html', '<section id="chat-section"></section><section id="blog"></section>');

  it('allows other pages only the homepage anchors of the phase', () => {
    const s = site([home, page('journal/x/index.html', '<a href="/#chat-section">x</a><a href="/#blog">y</a>')]);
    expect(rules(s, { homeAnchors: ['chat-section', 'blog'] })).toEqual([]);
    expect(validate(s, { homeAnchors: ['blog'] })).toEqual([
      { file: 'journal/x/index.html', rule: 'legacy-home-anchor', detail: '<a href> "/#chat-section"' },
    ]);
  });

  it('lets the homepage link its own anchors in any phase', () => {
    expect(rules(site([page('index.html', '<a href="#chat-section">x</a><div id="chat-section"></div>')]))).toEqual([]);
  });

  it('applies to JSON-LD breadcrumb items too', () => {
    expect(rules(site([home, page('blog/x/index.html', crumb('Блог', `${SITE}/#blog`))]))).toEqual(['legacy-home-anchor']);
  });

  describe('manifest links, identified by text', () => {
    const hub = page('services/index.html', '<div id="chat"></div>');
    const policy = (texts) => ({
      homeAnchors: [],
      links: [{ rule: 'cta-links', href: `${SITE}/services/#chat`, files: { 'blog/x/index.html': texts } }],
    });
    const withLinks = (...pairs) =>
      site([hub, page('blog/x/index.html', pairs.map(([text, href]) => `<a href="${href}">${text}</a>`).join(' '))]);

    it('passes when every listed text points at the target, relative or absolute', () => {
      const s = withLinks(['Обговорити →', '/services/#chat'], ['AI', `${SITE}/services/#chat`], ['Інше', '/services/']);
      expect(rules(s, policy(['Обговорити →', 'AI']))).toEqual([]);
    });
    it.each([
      ['one lost its #chat', [['Обговорити →', '/services/#chat'], ['AI', '/services/']]],
      ['an extra link with a listed text points at another valid page', [['Обговорити →', '/services/#chat'], ['AI', '/services/#chat'], ['AI', '/services/']]],
      ['a listed text is missing', [['Обговорити →', '/services/#chat']]],
      ['the multiset differs', [['Обговорити →', '/services/#chat'], ['Обговорити →', '/services/#chat']]],
    ])('flags when %s', (_, pairs) => {
      expect(rules(withLinks(...pairs), policy(['Обговорити →', 'AI']))).toEqual(['cta-links']);
    });
    it('flags a missing manifest page', () => {
      expect(rules(site([page('index.html')]), policy(['AI']))).toEqual(['cta-links']);
    });
    it('checks R2 the same way: «напишіть мені» into the sales chat is caught', () => {
      const r2 = { homeAnchors: [], links: [{ rule: 'contact-links', href: PERSONAL_CONTACT, files: { 'blog/x/index.html': ['напишіть мені'] } }] };
      expect(rules(withLinks(['напишіть мені', PERSONAL_CONTACT]), r2)).toEqual([]);
      expect(rules(withLinks(['напишіть мені', '/services/#chat']), r2)).toEqual(['contact-links']);
    });
  });

  describe('breadcrumbs', () => {
    const rule = { pages: /^services\/[^/]+\/index\.html$/, name: 'Послуги', item: `${SITE}/services/` };
    const blogRule = { pages: /^blog\/[^/]+\/index\.html$/, name: 'Блог', item: `${SITE}/#blog` };
    const policy = { homeAnchors: ['scenarios', 'blog'], breadcrumbs: [rule, blogRule] };
    const base = [page('index.html', '<div id="scenarios"></div><div id="blog"></div>'), page('services/index.html')];
    const check = (rel, body) => rules(site([...base, page(rel, body)]), policy);

    it('passes a numeric position 2 with item as a string or as an object', () => {
      expect(check('services/x/index.html', crumb('Послуги', `${SITE}/services/`))).toEqual([]);
      expect(check('services/x/index.html', ld({ '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 2, item: { '@id': `${SITE}/services/`, name: 'Послуги' } },
      ] }))).toEqual([]);
    });
    it.each([
      ['still points at the homepage anchor', 'services/x/index.html', crumb('Послуги', `${SITE}/#scenarios`)],
      ['keeps the old name', 'services/x/index.html', crumb('Портфоліо', `${SITE}/services/`)],
      ['has position "2" as a string', 'services/x/index.html', crumb('Послуги', `${SITE}/services/`, '2')],
      ['is missing', 'services/y/index.html', ''],
      ['changed /#blog to the homepage', 'blog/x/index.html', crumb('Блог', `${SITE}/`)],
      ['has two position-2 items', 'services/x/index.html', ld({ '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 2, name: 'Послуги', item: `${SITE}/services/` },
        { '@type': 'ListItem', position: 2, name: 'Послуги', item: `${SITE}/services/` },
      ] })],
      ['is right only in total across two lists', 'services/x/index.html', ld([
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Головна', item: `${SITE}/` }] },
        { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 2, name: 'Послуги', item: `${SITE}/services/` },
          { '@type': 'ListItem', position: 2, name: 'Послуги', item: `${SITE}/services/` },
        ] },
      ])],
    ])('flags a crumb that %s', (_, rel, body) => expect(check(rel, body)).toEqual(['breadcrumb']));
  });

  it('requires the exact number of entity @id occurrences per listed page', () => {
    const policy = { homeAnchors: [], idCounts: { [`${SITE}/#business`]: { 'index.html': 2 } } };
    const withIds = (...ids) => site([page('index.html', ids.map((id) => ld({ '@id': id })).join(''))]);
    expect(rules(withIds(`${SITE}/#business`, `${SITE}/#business`), policy)).toEqual([]);
    expect(rules(withIds(`${SITE}/#business`), policy)).toEqual(['entity-id']);
    expect(rules(withIds(`${SITE}/#business`, `${SITE}/services/#business`), policy)).toEqual(['entity-id']);
    expect(rules(withIds(`${SITE}/#business`, `${SITE}/#business`, `${SITE}/#business`), policy)).toEqual(['entity-id']);
  });
});

describe('phases f1-pre → f1-done on a miniature site built from the manifests', () => {
  /** Every manifest page with its links, @ids and breadcrumbs, as each phase expects them. */
  function mini(phaseName) {
    const phase = PHASES[phaseName];
    const bodies = new Map();
    const add = (rel, html) => bodies.set(rel, (bodies.get(rel) ?? '') + html);
    add('index.html', '<div id="chat-section"></div><div id="scenarios"></div><div id="portfolio"></div><div id="blog"></div>');
    add('services/index.html', '<section id="contact"></section>');
    for (const { href, files } of phase.links) {
      for (const [rel, texts] of Object.entries(files)) add(rel, texts.map((t) => `<a href="${href}">${t}</a>`).join(' '));
    }
    for (const [id, files] of Object.entries(phase.idCounts)) {
      for (const [rel, n] of Object.entries(files)) add(rel, ld({ '@id': id }).repeat(n));
    }
    for (const rel of [...bodies.keys()]) {
      const rule = phase.breadcrumbs.find((b) => b.pages.test(rel));
      if (rule) add(rel, crumb(rule.name, rule.item));
    }
    return site([...bodies].map(([rel, body]) => page(rel, body)));
  }

  it('each state is clean under its own phase', () => {
    expect(validate(mini('f1-pre'), PHASES['f1-pre'])).toEqual([]);
    expect(validate(mini('f1-done'), PHASES['f1-done'])).toEqual([]);
  });

  it('f1-done rejects the pre-migration state on every migrated rule', () => {
    expect(new Set(rules(mini('f1-pre'), PHASES['f1-done']))).toEqual(
      new Set(['legacy-home-anchor', 'cta-links', 'hub-links', 'contact-links', 'breadcrumb'])
    );
  });
});


/**
 * The Ф2 inventory, written out from doc/HUBS_PLAN.md rather than derived from HUB_MEMBERS — the manifest
 * feeds both the migration and the hub tests, so it must not be the only thing that says it is right.
 */
const F2_INVENTORY = {
  'journal/diahnoz-u-27/index.html': 'Паркінсон',
  'journal/rannii-parkinsonizm/index.html': 'Паркінсон',
  'journal/parkinson-shcho-robyty/index.html': 'Паркінсон',
  'journal/eksperyment-nad-soboyu/index.html': 'Паркінсон',
  'journal/hoverla/index.html': 'Паркінсон',
  'journal/holodylnyi-apokalipsys/index.html': 'Творчість',
  'journal/my-zh-tilky-na-kavu/index.html': 'Творчість',
  'journal/sarai/index.html': 'Творчість',
  'journal/nobel-plache/index.html': 'Творчість',
  'journal/kabachok-starosta/index.html': 'Творчість',
  'journal/viddil-vtrachenoho-chasu/index.html': 'Творчість',
  'journal/poverny-meni-chas/index.html': 'Творчість',
  'journal/velozaizd/index.html': 'Журнал',
  'journal/velyke-budivnytstvo/index.html': 'Журнал',
  'journal/zhyly-buly/index.html': 'Журнал',
  'journal/vira-i-religiya/index.html': 'Журнал',
  'journal/vira-i-religiya-2/index.html': 'Журнал',
  'journal/bytva-tserkov/index.html': 'Журнал',
  'journal/pamyati-maksyma-babaka/index.html': 'Журнал',
  'blog/devlog-business-empire-idle/index.html': 'Код',
  'blog/devlog-empire-online/index.html': 'Код',
  'blog/jarvis-ai-assistant/index.html': 'Код',
  'blog/chek-list-zamovlennya-sajtu/index.html': 'Послуги',
  'blog/react-vs-tilda/index.html': 'Послуги',
  'blog/skilky-koshtuye-sajt/index.html': 'Послуги',
  'blog/tilda-vs-webflow-vs-kastom/index.html': 'Послуги',
  'blog/yak-obrati-rozrobnyka/index.html': 'Послуги',
  'blog/yak-zamovyty-sajt/index.html': 'Послуги',
  'blog/seo-bez-reklamy-keis-atlas/index.html': 'Послуги',
  'blog/getting-cited-ai-poshuk/index.html': 'Послуги',
  'blog/internal-linking/index.html': 'Послуги',
};

const HUB_URL = {
  'Паркінсон': `${SITE}/parkinson/`,
  'Творчість': `${SITE}/creative/`,
  'Журнал': `${SITE}/journal/`,
  'Код': `${SITE}/code/`,
  'Послуги': `${SITE}/services/`,
};

/** The extra collections each hub shows, from doc/HUBS_PLAN.md — again written out, not derived. */
const F2_ALSO = {
  'parkinson/': [],
  'creative/': [],
  'journal/': [ // the feed keeps every journal post, including those owned by the two hubs
    'journal/diahnoz-u-27/index.html', 'journal/rannii-parkinsonizm/index.html',
    'journal/parkinson-shcho-robyty/index.html', 'journal/eksperyment-nad-soboyu/index.html',
    'journal/hoverla/index.html', 'journal/holodylnyi-apokalipsys/index.html',
    'journal/kabachok-starosta/index.html', 'journal/viddil-vtrachenoho-chasu/index.html',
    'journal/poverny-meni-chas/index.html', 'journal/my-zh-tilky-na-kavu/index.html',
    'journal/sarai/index.html', 'journal/nobel-plache/index.html',
  ],
  'code/': [ // «SEO й AI-пошук» — owned by /services/, shown here too
    'blog/seo-bez-reklamy-keis-atlas/index.html', 'blog/getting-cited-ai-poshuk/index.html',
    'blog/internal-linking/index.html',
  ],
  'services/': [],
  'blog/': [ // the archive lists all twelve
    'blog/chek-list-zamovlennya-sajtu/index.html', 'blog/devlog-business-empire-idle/index.html',
    'blog/devlog-empire-online/index.html', 'blog/getting-cited-ai-poshuk/index.html',
    'blog/internal-linking/index.html', 'blog/jarvis-ai-assistant/index.html',
    'blog/react-vs-tilda/index.html', 'blog/seo-bez-reklamy-keis-atlas/index.html',
    'blog/skilky-koshtuye-sajt/index.html', 'blog/tilda-vs-webflow-vs-kastom/index.html',
    'blog/yak-obrati-rozrobnyka/index.html', 'blog/yak-zamovyty-sajt/index.html',
  ],
};

describe('Ф2 — HUB_MEMBERS', () => {
  const primary = primaryHub();

  it('gives every journal and blog post exactly one hub, and no post two', () => {
    expect([...primary.keys()].sort()).toEqual(Object.keys(F2_INVENTORY).sort());
    const listed = Object.values(HUB_MEMBERS).flatMap((h) => h.primary);
    expect(listed.length, 'a post is primary in two hubs').toBe(new Set(listed).size);
  });

  it('assigns each post to the hub doc/HUBS_PLAN.md names', () => {
    for (const [file, name] of Object.entries(F2_INVENTORY)) {
      expect(primary.get(file)?.name, file).toBe(name);
      expect(primary.get(file)?.item, file).toBe(HUB_URL[name]);
    }
  });

  it('shows exactly the extra collections the plan lists', () => {
    for (const [hub, files] of Object.entries(F2_ALSO)) {
      expect(HUB_MEMBERS[hub].also.slice().sort(), hub).toEqual(files.slice().sort());
      const both = HUB_MEMBERS[hub].also.filter((f) => HUB_MEMBERS[hub].primary.includes(f));
      expect(both, `${hub}: a post is both owned and merely shown`).toEqual([]);
    }
    expect(Object.keys(HUB_MEMBERS).sort()).toEqual(Object.keys(F2_ALSO).sort());
  });

  it('names only pages that exist, in primary and in the extra collections', () => {
    const real = loadSite();
    for (const [hub, { primary: own, also }] of Object.entries(HUB_MEMBERS)) {
      for (const file of [...own, ...also]) expect(real.files.has(file), `${hub}: ${file}`).toBe(true);
    }
  });

  it('shows every journal post in the /journal/ feed, hub or not', () => {
    const journal = Object.keys(F2_INVENTORY).filter((f) => f.startsWith('journal/'));
    const shown = new Set([...HUB_MEMBERS['journal/'].primary, ...HUB_MEMBERS['journal/'].also]);
    expect([...shown].sort()).toEqual(journal.sort());
  });

  it('lists all twelve articles in the /blog/ archive and owns none of them', () => {
    const blog = Object.keys(F2_INVENTORY).filter((f) => f.startsWith('blog/'));
    expect(HUB_MEMBERS['blog/'].also.sort()).toEqual(blog.sort());
    expect(HUB_MEMBERS['blog/'].primary).toEqual([]);
  });
});

describe('phases f2-pre → f2-done', () => {
  /** The manifest pages of the phase plus one post per hub, each carrying the breadcrumb that phase expects. */
  function miniF2(phaseName) {
    const phase = PHASES[phaseName];
    const bodies = new Map();
    const add = (rel, html) => bodies.set(rel, (bodies.get(rel) ?? '') + html);
    add('index.html', '<div id="blog"></div>');
    add('services/index.html', '<section id="contact"></section>');
    add('journal/index.html', '');
    // the hubs the breadcrumbs point at must exist, or layer A reports a broken link — as it should
    for (const hub of Object.keys(HUB_MEMBERS)) add(`${hub}index.html`, '');
    for (const { href, files } of phase.links) {
      for (const [rel, texts] of Object.entries(files)) add(rel, texts.map((t) => `<a href="${href}">${t}</a>`).join(' '));
    }
    for (const [id, files] of Object.entries(phase.idCounts)) {
      for (const [rel, n] of Object.entries(files)) add(rel, ld({ '@id': id }).repeat(n));
    }
    for (const rel of Object.keys(F2_INVENTORY)) add(rel, '');
    for (const rel of [...bodies.keys()]) {
      const rule = phase.breadcrumbs.find((b) => b.pages.test(rel));
      // a post the phase does not govern keeps what Ф1 left: «Блог» → the homepage anchor
      if (rule) add(rel, crumb(rule.name, rule.item));
      else if (rel in F2_INVENTORY) add(rel, crumb('Блог', `${SITE}/#blog`));
    }
    return site([...bodies].map(([rel, body]) => page(rel, body)));
  }

  it('f2-pre is the state Ф1 left behind', () => {
    expect(PHASES['f2-pre']).toBe(PHASES['f1-done']);
  });

  it('each state is clean under its own phase', () => {
    expect(validate(miniF2('f2-pre'), PHASES['f2-pre'])).toEqual([]);
    expect(validate(miniF2('f2-done'), PHASES['f2-done'])).toEqual([]);
  });

  it('f2-done rejects the pre-migration breadcrumbs, including the last homepage anchor', () => {
    expect(new Set(rules(miniF2('f2-pre'), PHASES['f2-done']))).toEqual(new Set(['legacy-home-anchor', 'breadcrumb']));
  });

  it('f2-pre rejects the migrated breadcrumbs of blog posts', () => {
    expect(rules(miniF2('f2-done'), PHASES['f2-pre'])).toContain('breadcrumb');
  });

  it('f2-done targets are the ones doc/HUBS_PLAN.md fixed', () => {
    const done = PHASES['f2-done'];
    expect(done.homeAnchors).toEqual([]);
    expect(done.links.map((l) => [l.rule, l.href])).toEqual([
      ['cta-links', `${SITE}/services/#contact`],
      ['hub-links', `${SITE}/services/`],
      ['contact-links', PERSONAL_CONTACT],
    ]);
    expect(done.breadcrumbs.map((b) => [b.name, b.item])).toEqual([
      ['Послуги', `${SITE}/services/`], // services/*
      ['Послуги', `${SITE}/services/`], // projects/*
      ['Паркінсон', `${SITE}/parkinson/`],
      ['Творчість', `${SITE}/creative/`],
      ['Журнал', `${SITE}/journal/`],
      ['Код', `${SITE}/code/`],
      ['Послуги', `${SITE}/services/`], // the nine library articles
    ]);
  });
});

describe('public/ (integration)', () => {
  const real = loadSite();
  const countRules = (errors) => errors.reduce((acc, e) => ({ ...acc, [e.rule]: (acc[e.rule] ?? 0) + 1 }), {});

  it(`is clean in the current phase (${CURRENT_PHASE})`, () => {
    expect(validate(real)).toEqual([]);
  });

  it('no longer matches the pre-migration phase — exactly on the rules step 3 migrated', () => {
    expect(Object.keys(countRules(validate(real, PHASES['f1-pre']))).sort()).toEqual(
      ['breadcrumb', 'contact-links', 'cta-links'].sort()
    );
  });

  it('manifests match the Ф1 inventory (plan v3: 6 of the 25 CTAs were rewritten, not repointed)', () => {
    const size = (phase, rule) => {
      const files = PHASES[phase].links.find((l) => l.rule === rule).files;
      return [Object.keys(files).length, Object.values(files).flat().length];
    };
    expect(size('f1-pre', 'cta-links')).toEqual([22, 25]);
    expect(size('f1-done', 'cta-links')).toEqual([17, 19]);
    expect(size('f1-done', 'hub-links')).toEqual([5, 5]);
    for (const phase of ['f1-pre', 'f1-done']) expect(size(phase, 'contact-links')).toEqual([2, 3]);
  });

  // The manifest must not be able to weaken itself: coverage, completeness and targets are checked independently.
  it('breadcrumb rules of every phase cover each governed page exactly once — journal/ joins in f2-done', () => {
    const all = real.pages.map((p) => p.rel);
    const commercial = all.filter((rel) => /^(services|projects|blog)\/[^/]+\/index\.html$/.test(rel));
    const journal = all.filter((rel) => /^journal\/[^/]+\/index\.html$/.test(rel));
    expect(commercial.length).toBeGreaterThan(20);
    expect(journal.length).toBe(19); // новий пост журналу — оновлювати свідомо, це запобіжник від дрейфу
    for (const [name, phase] of Object.entries(PHASES)) {
      const governed = name === 'f2-done' ? [...commercial, ...journal] : commercial;
      const badly = governed.filter((rel) => phase.breadcrumbs.filter((b) => b.pages.test(rel)).length !== 1);
      expect(badly, name).toEqual([]);
      if (name !== 'f2-done') {
        const early = journal.filter((rel) => phase.breadcrumbs.some((b) => b.pages.test(rel)));
        expect(early, `${name} must not govern journal/ yet`).toEqual([]);
      }
    }
  });

  it('the business entity is defined exactly once on the whole site', () => {
    const nodes = [];
    for (const page of real.pages) {
      for (const block of parsePage(page.html).ld) {
        const walk = (n) => {
          if (Array.isArray(n)) return n.forEach(walk);
          if (!n || typeof n !== 'object') return;
          if ([].concat(n['@type']).includes('ProfessionalService')) {
            const fields = Object.keys(n).filter((k) => k !== '@type' && k !== '@id');
            nodes.push({ rel: page.rel, id: n['@id'], definition: fields.length > 1 });
          }
          Object.values(n).forEach(walk);
        };
        walk(block);
      }
    }
    const definitions = nodes.filter((n) => n.definition);
    expect(definitions.map((n) => n.rel), 'only /services/ may define the business').toEqual(['services/index.html']);
    expect(definitions[0].id).toBe(`${SITE}/#business`);
    for (const n of nodes) expect(n.id, `${n.rel}: an anonymous ProfessionalService`).toBe(`${SITE}/#business`);
  });

  it('idCounts of every phase list every page that references the entity', () => {
    for (const [name, phase] of Object.entries(PHASES)) {
      for (const [id, files] of Object.entries(phase.idCounts)) {
        const referencing = real.pages.filter((p) => parsePage(p.html).ld.flatMap(ldIds).includes(id)).map((p) => p.rel);
        expect(Object.keys(files).sort(), `${name}: ${id}`).toEqual(referencing.sort());
      }
    }
  });

  it('f1-done targets are the ones doc/SERVICES_HUB_PLAN.md fixed', () => {
    const done = PHASES['f1-done'];
    expect(done.homeAnchors).toEqual(['blog']);
    expect(done.links.map((l) => [l.rule, l.href])).toEqual([
      ['cta-links', 'https://www.parkinsandr.tech/services/#contact'],
      ['hub-links', 'https://www.parkinsandr.tech/services/'],
      ['contact-links', 'https://t.me/+380936429885'],
    ]);
    expect(done.breadcrumbs.map((b) => [b.name, b.item])).toEqual([
      ['Послуги', 'https://www.parkinsandr.tech/services/'],
      ['Послуги', 'https://www.parkinsandr.tech/services/'],
      ['Блог', 'https://www.parkinsandr.tech/#blog'],
    ]);
  });

  it('every phase manifest names existing pages', () => {
    for (const [name, p] of Object.entries(PHASES)) {
      const named = [...p.links.flatMap((l) => Object.keys(l.files)), ...Object.values(p.idCounts).flatMap(Object.keys)];
      for (const file of named) expect(real.files.has(file), `${name}: ${file}`).toBe(true);
    }
  });
});
