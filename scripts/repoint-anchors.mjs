#!/usr/bin/env node
// Ф1 step 3 of doc/SERVICES_HUB_PLAN.md: repoint the homepage anchors other pages depend on.
//   R1  <a href="/#chat-section"> in services/*, projects/*, blog/*, pro-mene  → /services/#contact
//   R2  «напишіть мені» in the Parkinson posts of the manifest                → personal contact
//   R3  BreadcrumbList item …/#scenarios                                      → …/services/
//   R4  BreadcrumbList item …/#portfolio named «Портфоліо»                     → …/services/ «Послуги»
// Only <a href> values and those BreadcrumbList fields change. Everything is planned and verified first —
// exact counts, a JSON-LD semantic diff, the f1-done validator — then written, or nothing is.
// Idempotent; public/index.html is never touched. `node scripts/repoint-anchors.mjs [--dry]`
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, PERSONAL_CONTACT, PHASES } from './link-policy.mjs';
import { loadSite, textOf, validate } from './check-links.mjs';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const FROM = '/#chat-section';
const CTA_TARGET = '/services/#contact';
const HUB = `${SITE}/services/`;
const R1_SCOPE = /^(services|projects|blog)\/[^/]+\/index\.html$|^pro-mene\/index\.html$/;
const R2_FILES = PHASES['f1-done'].links.find((l) => l.rule === 'contact-links').files;
const BREADCRUMB_RULES = { [`${SITE}/#scenarios`]: 'R3', [`${SITE}/#portfolio`]: 'R4' };

/** Inventory 25/3/5/6 minus the six CTAs that step 3 rewrote by hand before this run (plan v3). */
export const EXPECTED = { R1: 19, R2: 3, R3: 5, R4: 6 };

const SKIP_RE = /<!--[\s\S]*?-->|<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const ATTRS = String.raw`(?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*`;
const A_RE = new RegExp(String.raw`(<a${ATTRS}\s*>)([\s\S]*?)(<\/a>)`, 'gi');
const HREF_RE = /(\shref\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const LD_RE = /(<script\b[^>]*\btype\s*=\s*['"]application\/ld\+json['"][^>]*>)([\s\S]*?)(<\/script>)/gi;

/** Apply `fn` to the parts of `html` outside the `skip` regions, which are kept verbatim. */
function mapOutside(html, skip, fn) {
  let out = '';
  let last = 0;
  for (const m of html.matchAll(skip)) {
    out += fn(html.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(html.slice(last));
}

/** R1/R2 on markup (no scripts, styles or comments): rewrite the href value only, keeping its quotes. */
function repointAnchors(markup, rel, stats, errors) {
  return markup.replace(A_RE, (whole, open, inner, close) => {
    const href = HREF_RE.exec(open);
    if (!href || (href[2] ?? href[3] ?? href[4]) !== FROM) return whole;
    const text = textOf(inner);
    let target;
    if (R2_FILES[rel]) {
      if (!R2_FILES[rel].includes(text)) {
        errors.push(`${rel}: /#chat-section «${text}» is not in the R2 manifest`);
        return whole;
      }
      target = PERSONAL_CONTACT;
      stats.R2++;
    } else if (R1_SCOPE.test(rel)) {
      target = CTA_TARGET;
      stats.R1++;
    } else {
      errors.push(`${rel}: /#chat-section «${text}» is outside R1 and R2`);
      return whole;
    }
    const quote = href[2] !== undefined ? '"' : href[3] !== undefined ? "'" : '';
    return open.replace(HREF_RE, () => `${href[1]}${quote}${target}${quote}`) + inner + close;
  });
}

/** Leaf-level differences between two parsed JSON values. */
function diffJson(a, b, path = [], out = []) {
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diffJson(a[key], b[key], [...path, key], out);
  } else if (a !== b) {
    out.push({ path, from: a, to: b });
  }
  return out;
}

/** Every difference must be an R3/R4 change of a ListItem inside a BreadcrumbList; R4 also renames the item. */
function checkBreadcrumbDiff(before, after) {
  const counts = { R3: 0, R4: 0 };
  const problems = [];
  const at = (path) => path.reduce((node, key) => node?.[key], before);
  let renames = 0;
  for (const { path, from, to } of diffJson(before, after)) {
    const item = at(path.slice(0, -1));
    const inBreadcrumb = item?.['@type'] === 'ListItem' && path.at(-3) === 'itemListElement' &&
      [].concat(at(path.slice(0, -3))?.['@type']).includes('BreadcrumbList');
    const key = path.at(-1);
    if (inBreadcrumb && key === 'item' && BREADCRUMB_RULES[from] && to === HUB) counts[BREADCRUMB_RULES[from]]++;
    else if (inBreadcrumb && key === 'name' && from === 'Портфоліо' && to === 'Послуги' && item.item === `${SITE}/#portfolio`) renames++;
    else problems.push(`unexpected JSON-LD change at ${path.join('.')}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  }
  if (renames !== counts.R4) problems.push(`R4: ${counts.R4} #portfolio item(s) but ${renames} «Портфоліо» → «Послуги» rename(s)`);
  return { counts, problems };
}

/** R3/R4 on JSON-LD blocks outside comments: plain string replacement, then proven by a semantic diff. */
function repointBreadcrumbs(html, rel, stats, errors) {
  return mapOutside(html, COMMENT_RE, (part) => part.replace(LD_RE, (whole, open, json, close) => {
    if (!Object.keys(BREADCRUMB_RULES).some((url) => json.includes(`"${url}"`))) return whole;
    let before;
    try {
      before = JSON.parse(json);
    } catch {
      return whole; // a broken block is reported by the integrity validator
    }
    let next = json;
    for (const url of Object.keys(BREADCRUMB_RULES)) next = next.split(`"${url}"`).join(`"${HUB}"`);
    next = next.replace(/("name"\s*:\s*)"Портфоліо"/g, '$1"Послуги"');
    const { counts, problems } = checkBreadcrumbDiff(before, JSON.parse(next));
    if (problems.length) {
      errors.push(...problems.map((p) => `${rel}: ${p}`));
      return whole;
    }
    stats.R3 += counts.R3;
    stats.R4 += counts.R4;
    return open + next + close;
  }));
}

/** Plan every change in memory: { stats, errors, changes: [{ rel, html }] }. Writes nothing. */
export function planRepoint(site) {
  const stats = { R1: 0, R2: 0, R3: 0, R4: 0 };
  const errors = [];
  const changes = [];
  for (const { rel, html } of site.pages) {
    if (rel === 'index.html') continue;
    let next = mapOutside(html, SKIP_RE, (markup) => repointAnchors(markup, rel, stats, errors));
    next = repointBreadcrumbs(next, rel, stats, errors);
    if (next !== html) changes.push({ rel, html: next });
  }
  return { stats, errors, changes };
}

/** Problems that forbid writing: planning errors, count mismatches, and the validator on the planned site. */
export function verifyPlan(site, plan, expected = EXPECTED, policy = PHASES['f1-done']) {
  const problems = [...plan.errors];
  const planned = Object.values(plan.stats).reduce((sum, n) => sum + n, 0);
  if (planned > 0) {
    for (const [rule, n] of Object.entries(expected)) {
      if (plan.stats[rule] !== n) problems.push(`${rule}: expected ${n}, planned ${plan.stats[rule]}`);
    }
  }
  const changed = new Map(plan.changes.map((c) => [c.rel, c.html]));
  const after = { ...site, pages: site.pages.map((p) => ({ rel: p.rel, html: changed.get(p.rel) ?? p.html })) };
  for (const e of validate(after, policy)) problems.push(`${e.file}: ${e.rule} — ${e.detail}`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = loadSite();
  const plan = planRepoint(site);
  const problems = verifyPlan(site, plan);
  const { R1, R2, R3, R4 } = plan.stats;
  console.log(`planned: R1 ${R1} · R2 ${R2} · R3 ${R3} · R4 ${R4} in ${plan.changes.length} file(s)`);
  if (problems.length) {
    for (const p of problems) console.error(p);
    console.error(`${problems.length} problem(s) — nothing written`);
    process.exitCode = 1;
  } else if (process.argv.includes('--dry')) {
    for (const c of plan.changes) console.log(`  would write ${c.rel}`);
  } else {
    for (const c of plan.changes) writeFileSync(join(PUBLIC, c.rel), c.html, 'utf8');
    console.log(`written ${plan.changes.length} file(s)`);
  }
}
