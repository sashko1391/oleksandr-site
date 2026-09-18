#!/usr/bin/env node
// Link validator for the static site (no deps). `node scripts/check-links.mjs [--phase <name>]`
// Layer A — integrity: every same-origin reference (href/src/srcset/poster/xlink:href, CSS url() in <style>
// and style="", absolute <meta content>, JSON-LD URLs except entity @id) resolves to a file in canonical form,
// its #fragment to an id on the target page; ids are unique; no <base>; JSON-LD parses and uses absolute
// URLs; every indexable page has exactly one canonical equal to its own URL.
// Layer B — migration policy of a phase (scripts/link-policy.mjs). Sitemap: tests/policy.test.js.
// Not covered: <form action> (API routes are not files). Fragments into non-HTML files (external SVG sprites)
// are reported as errors — inline the SVG instead.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { SITE, PHASES, CURRENT_PHASE } from './link-policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const HOSTS = ['www.parkinsandr.tech', 'parkinsandr.tech'];
const ABSOLUTE = /^(https?:)?\/\//i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const URL_ATTRS = ['href', 'src', 'poster', 'xlink:href'];
/** schema.org properties whose values are URLs — a relative value there is an error (site convention). */
const LD_URL_KEYS = new Set(['url', 'item', 'image', 'logo', 'mainEntityOfPage', 'isBasedOn', 'sameAs', 'contentUrl', 'thumbnailUrl', 'embedUrl']);
/** Percent-escapes of characters that must appear literally: unreserved ASCII and the '/' '\' separators. */
const ESCAPED_PLAIN = /%(?:2[def]|3\d|4[1-9a-f]|5[0-9acf]|6[1-9a-f]|7[0-9ae])/i;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…' };

// Quote-aware attribute list, so a '>' inside an attribute value does not end the tag.
const ATTRS = String.raw`((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)`;
const TAG_RE = new RegExp(String.raw`<([a-z][a-z0-9-]*)${ATTRS}\s*\/?>`, 'gi');
const A_RE = new RegExp(String.raw`<a${ATTRS}\s*>([\s\S]*?)<\/a>`, 'gi');
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const RAW_TEXT_RE = /(<(script|style|textarea)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi;
const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const CSS_URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const LD_RE = /<script\b[^>]*\btype\s*=\s*['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;

/** 'journal/x/index.html' → '/journal/x/', 'index.html' → '/', '404.html' → '/404.html'. */
export function urlOf(rel) {
  return '/' + rel.replace(/(^|\/)index\.html$/, '$1');
}

/** URL path → file under public/: '/x/' → 'x/index.html', '/a.webp' → 'a.webp'. */
export function fileOf(path) {
  const p = path.replace(/^\/+/, '');
  return p === '' || p.endsWith('/') ? `${p}index.html` : p;
}

function attrsOf(raw) {
  const attrs = {};
  for (const [, key, dq, sq, uq] of raw.matchAll(ATTR_RE)) attrs[key.toLowerCase()] = dq ?? sq ?? uq ?? '';
  return attrs;
}

/** Numeric and common named character references → text (unknown names stay as written). */
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e] ?? m;
    const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

/** Recursively visit every object node of a JSON-LD value (arrays, @graph, nesting). */
function walk(node, visit) {
  if (Array.isArray(node)) node.forEach((x) => walk(x, visit));
  else if (node && typeof node === 'object') {
    visit(node);
    for (const v of Object.values(node)) walk(v, visit);
  }
}

/**
 * Link candidates of a JSON-LD value: absolute URL strings under any key except entity @id, plus
 * item.@id (a breadcrumb target). A relative value under a URL property comes back with `relative: true`.
 */
export function ldRefs(block) {
  const out = [];
  walk(block, (node) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === '@id') continue;
      for (const v of [].concat(value)) {
        const isObject = key === 'item' && v && typeof v === 'object';
        const target = isObject ? v['@id'] : v;
        if (typeof target !== 'string') continue;
        const where = `JSON-LD ${key}${isObject ? '.@id' : ''}`;
        if (ABSOLUTE.test(target)) out.push({ value: target, where });
        else if (LD_URL_KEYS.has(key) && !HAS_SCHEME.test(target)) out.push({ value: target, where, relative: true });
      }
    }
  });
  return out;
}

/** Every "@id" string of a JSON-LD value. */
export function ldIds(block) {
  const ids = [];
  walk(block, (node) => typeof node['@id'] === 'string' && ids.push(node['@id']));
  return ids;
}

function cssRefs(css, where) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(CSS_URL_RE)].map(([, , value]) => ({ value, where }));
}

/** srcset → candidate URLs (HTML spec, simplified): a URL is a run of non-whitespace, its descriptors end at a comma. */
function srcsetUrls(srcset) {
  const urls = [];
  for (let i = 0; i < srcset.length; ) {
    while (i < srcset.length && /[\s,]/.test(srcset[i])) i++;
    let j = i;
    while (j < srcset.length && !/\s/.test(srcset[j])) j++;
    const url = srcset.slice(i, j);
    if (url.endsWith(',')) i = j; // "a.webp, b.webp" — a trailing comma means no descriptors
    else for (i = j; i < srcset.length && srcset[i] !== ','; i++);
    if (url.replace(/,+$/, '')) urls.push(url.replace(/,+$/, ''));
  }
  return urls;
}

/** Everything the checks need from one page. Comments and script/style/textarea bodies are not markup. */
export function parsePage(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const markup = clean.replace(RAW_TEXT_RE, '$1$3');
  const tags = [...markup.matchAll(TAG_RE)].map(([, name, raw]) => ({ name: name.toLowerCase(), attrs: attrsOf(raw) }));
  const ld = [];
  const ldErrors = [];
  for (const [, json] of clean.matchAll(LD_RE)) {
    try {
      ld.push(JSON.parse(json));
    } catch (err) {
      ldErrors.push(err.message);
    }
  }
  const refs = [...clean.matchAll(STYLE_RE)].flatMap(([, css]) => cssRefs(css, '<style> url()'));
  for (const { name, attrs } of tags) {
    for (const key of URL_ATTRS) if (key in attrs) refs.push({ value: attrs[key], where: `<${name} ${key}>` });
    for (const value of srcsetUrls(attrs.srcset ?? '')) refs.push({ value, where: `<${name} srcset>` });
    if ('style' in attrs) refs.push(...cssRefs(attrs.style, `<${name} style> url()`));
    if (name === 'meta' && ABSOLUTE.test(attrs.content ?? '')) refs.push({ value: attrs.content, where: '<meta content>' });
  }
  const idList = tags.map((t) => t.attrs.id).filter(Boolean);
  return {
    ids: new Set(idList),
    duplicateIds: [...new Set(idList.filter((id, i) => idList.indexOf(id) !== i))],
    hasBase: tags.some((t) => t.name === 'base'),
    refs: [...refs, ...ld.flatMap(ldRefs)],
    canonicals: tags
      .filter((t) => t.name === 'link' && /(^|\s)canonical(\s|$)/i.test(t.attrs.rel ?? ''))
      .map((t) => t.attrs.href ?? ''),
    anchors: [...markup.matchAll(A_RE)].map(([, raw, inner]) => ({
      href: attrsOf(raw).href ?? '',
      text: decodeEntities(inner.replace(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g, '')).replace(/\s+/g, ' ').trim(),
    })),
    ld,
    ldErrors,
    noindex: tags.some(
      (t) => t.name === 'meta' && /^robots$/i.test(t.attrs.name ?? '') && /noindex/i.test(t.attrs.content ?? '')
    ),
  };
}

/** Reference on page `fromUrl` → { path, fragment, canonicalOrigin, canonicalPath } | { malformed } | null (not ours). */
export function resolveRef(value, fromUrl) {
  let u;
  try {
    u = new URL(value.trim(), SITE + fromUrl);
  } catch {
    return { malformed: true };
  }
  if (!HOSTS.includes(u.hostname)) return null; // external, or mailto:/tel:/data: (no host)
  try {
    return {
      path: decodeURIComponent(u.pathname),
      fragment: decodeURIComponent(u.hash.slice(1)),
      canonicalOrigin: u.origin === SITE,
      canonicalPath: !ESCAPED_PLAIN.test(u.pathname),
    };
  } catch {
    return { malformed: true };
  }
}

/** URL path → { file } (null for a vercel.json rewrite) or { error: <rule> }. */
function lookup(site, path) {
  if (site.virtual.has(path)) return { file: null };
  if (/(^|\/)index\.html$/.test(path)) return { error: 'non-canonical-path' };
  const file = fileOf(path);
  if (site.files.has(file)) return { file };
  if (!path.endsWith('/') && site.files.has(fileOf(`${path}/`))) return { error: 'missing-trailing-slash' };
  return { error: 'broken-link' };
}

function absolute(href, fromUrl) {
  try {
    return new URL(href, SITE + fromUrl).href;
  } catch {
    return '';
  }
}

/** Layer A for one page. */
function checkPage(site, parsed, rel, page, policy, report) {
  const self = urlOf(rel);
  for (const msg of page.ldErrors) report(rel, 'json-ld-parse', msg);
  for (const id of page.duplicateIds) report(rel, 'duplicate-id', id);
  if (page.hasBase) report(rel, 'base-tag', '<base> changes how every relative URL resolves');
  if (!page.noindex && (page.canonicals.length !== 1 || page.canonicals[0] !== SITE + self)) {
    report(rel, 'canonical', `expected exactly one ${SITE + self}, got [${page.canonicals.join(', ')}]`);
  }
  for (const { value, where, relative: isRelative } of page.refs) {
    const at = `${where} "${value}"`;
    if (isRelative) {
      report(rel, 'relative-json-ld-url', at);
      continue;
    }
    const ref = resolveRef(value, self);
    if (ref === null) continue;
    if (ref.malformed) {
      report(rel, 'malformed-url', at);
      continue;
    }
    if (!ref.canonicalOrigin) report(rel, 'non-canonical-origin', at);
    if (!ref.canonicalPath) report(rel, 'non-canonical-path', at);
    const target = lookup(site, ref.path);
    if (target.error) {
      report(rel, target.error, at);
      continue;
    }
    if (!ref.fragment) continue;
    const ids = parsed.get(target.file)?.ids;
    if (!ids) report(rel, 'fragment-target', `${at} — fragments only to HTML pages (inline SVG, no external sprites)`);
    else if (!ids.has(ref.fragment)) report(rel, 'missing-anchor', at);
    if (target.file === 'index.html' && rel !== 'index.html' && !policy.homeAnchors.includes(ref.fragment)) {
      report(rel, 'legacy-home-anchor', at);
    }
  }
}

/** The page has a BreadcrumbList, and each one has exactly one position-2 item: «name» → item. */
function breadcrumbOk(page, crumb) {
  const lists = [];
  for (const block of page.ld) walk(block, (n) => [].concat(n['@type']).includes('BreadcrumbList') && lists.push(n));
  const item = (i) => (typeof i.item === 'string' ? i.item : i.item?.['@id']);
  const name = (i) => i.name ?? i.item?.name;
  return lists.length > 0 && lists.every((list) => {
    const second = [].concat(list.itemListElement ?? []).filter((i) => i?.position === 2);
    return second.length === 1 && item(second[0]) === crumb.item && name(second[0]) === crumb.name;
  });
}

/** Layer B: manifest links, breadcrumbs and entity @id counts of the phase. */
function checkPolicy(parsed, policy, report) {
  const { links = [], breadcrumbs = [], idCounts = {} } = policy;
  for (const { rule, href, files } of links) {
    for (const [file, texts] of Object.entries(files)) {
      const wanted = new Set(texts);
      const found = (parsed.get(file)?.anchors ?? []).filter((a) => wanted.has(a.text));
      const elsewhere = found.filter((a) => absolute(a.href, urlOf(file)) !== href).length;
      const sameTexts = found.map((a) => a.text).sort().join('\n') === [...texts].sort().join('\n');
      if (!sameTexts || elsewhere) {
        report(file, rule, `expected [${texts.join(' | ')}] → ${href}; found ${found.length}, ${elsewhere} pointing elsewhere`);
      }
    }
  }
  for (const [rel, page] of parsed) {
    for (const crumb of breadcrumbs.filter((b) => b.pages.test(rel))) {
      if (!breadcrumbOk(page, crumb)) report(rel, 'breadcrumb', `position 2 must be «${crumb.name}» → ${crumb.item}`);
    }
  }
  for (const [id, files] of Object.entries(idCounts)) {
    for (const [file, expected] of Object.entries(files)) {
      const found = (parsed.get(file)?.ld ?? []).flatMap(ldIds).filter((x) => x === id).length;
      if (found !== expected) report(file, 'entity-id', `expected ${expected}× ${id}, found ${found}`);
    }
  }
}

/**
 * Validate `site` = { pages: [{ rel, html }], files: Set<rel>, virtual: Set<path> } against a phase policy.
 * Returns [{ file, rule, detail }] — empty when clean.
 */
export function validate(site, policy = PHASES[CURRENT_PHASE]) {
  const errors = [];
  const report = (file, rule, detail) => errors.push({ file, rule, detail });
  const parsed = new Map(site.pages.map((p) => [p.rel, parsePage(p.html)]));
  for (const [rel, page] of parsed) checkPage(site, parsed, rel, page, policy, report);
  checkPolicy(parsed, policy, report);
  return errors;
}

/** Load public/ (+ vercel.json rewrites) into the shape validate() expects. */
export function loadSite() {
  const files = [];
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) scan(p);
      else files.push(relative(PUBLIC, p).split(sep).join('/'));
    }
  };
  scan(PUBLIC);
  const { rewrites = [] } = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  return {
    pages: files.filter((f) => f.endsWith('.html')).map((rel) => ({ rel, html: readFileSync(join(PUBLIC, rel), 'utf8') })),
    files: new Set(files),
    virtual: new Set(rewrites.map((r) => r.source)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--phase');
  const phase = i === -1 ? CURRENT_PHASE : process.argv[i + 1];
  if (!PHASES[phase]) {
    console.error(`unknown phase "${phase}"; known: ${Object.keys(PHASES).join(', ')}`);
    process.exitCode = 2;
  } else {
    const errors = validate(loadSite(), PHASES[phase]);
    for (const e of errors) console.error(`${e.file}: ${e.rule} — ${e.detail}`);
    console.log(`check-links [${phase}]: ${errors.length} error(s)`);
    process.exitCode = errors.length ? 1 : 0;
  }
}
