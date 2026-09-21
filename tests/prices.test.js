// One price model across the site: /pricing/ is the source of truth (rule 13 of AGENTS.md, owner's
// decision of 2026-09-20 — model B). Every price quoted for my own work, visible or in JSON-LD, must
// be one of the prices published there.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = htmlFiles(PUBLIC).map((file) => ({
  rel: relative(PUBLIC, file).split(sep).join('/'),
  html: readFileSync(file, 'utf8'),
}));
const page = (rel) => pages.find((p) => p.rel === rel);

const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

/** Every price-like value inside a JSON-LD tree, with the path that carries it. */
function ldPrices(node, path = '', out = []) {
  if (Array.isArray(node)) node.forEach((v, i) => ldPrices(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'price' || k === 'minPrice' || k === 'highPrice' || k === 'lowPrice') && typeof v !== 'object') {
        out.push({ path: `${path}.${k}`, value: Number(v) });
      } else ldPrices(v, `${path}.${k}`, out);
    }
  }
  return out;
}

const CANON = new Set(jsonLd(page('pricing/index.html').html).flatMap((d) =>
  d['@type'] === 'Service' ? ldPrices(d).map((p) => p.value) : []));

/**
 * Prices that are not mine: market rates and third-party tools quoted as a comparison. Each entry must
 * still be present in the page, so a stale exception fails instead of silently widening the rule.
 */
const MARKET_CLAIMS = {
  'blog/skilky-koshtuye-sajt/index.html': [
    'Це вже AI-платформа або enterprise-проєкт від 150 000 ₴', // market ceiling, not my offer
    'від 70-100 тис. ₴ за базовий, від 150 тис. ₴ за повний кастом', // Ukrainian market for custom shops
    'абонемент від 5 000 ₴/міс', // support retainer, not a site price
  ],
  'blog/tilda-vs-webflow-vs-kastom/index.html': [
    'від 10 тис. ₴ за лендінг, від 30 тис. ₴ за бізнес-сайт', // a specialist's rate on a website builder
  ],
  'pricing/index.html': [
    'абонемент від 5 000 ₴/міс', // support retainer
    'від 5 000 ₴ за повний копірайт', // copywriting add-on, priced on this very page
  ],
};

/** «від N ₴» — the form the site uses to quote a starting price. */
const quoted = (html) =>
  [...html.matchAll(/від\s+([\d  ]{3,9})\s*₴/g)].map((m) => ({
    value: Number(m[1].replace(/[  ]/g, '')),
    context: html.slice(Math.max(0, m.index - 60), m.index + 40).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
  }));

describe('one price model', () => {
  it('/pricing/ publishes the six site types and the five extra services', () => {
    expect([...CANON].sort((a, b) => a - b)).toEqual([15000, 20000, 25000, 30000, 40000, 60000, 80000]);
  });

  it('the visible table of /pricing/ agrees with its own schema', () => {
    const html = page('pricing/index.html').html;
    for (const price of CANON) {
      const shown = price.toLocaleString('uk-UA').replace(/ /g, ' ');
      expect(html.replace(/ /g, ' '), `${price} is in the schema but not in the page`).toContain(`від ${shown} ₴`);
    }
  });

  it('no page quotes a price of mine that /pricing/ does not publish', () => {
    for (const p of pages) {
      const exceptions = MARKET_CLAIMS[p.rel] ?? [];
      for (const claim of exceptions) {
        expect(p.html.replace(/ /g, ' '), `stale exception in ${p.rel}`).toContain(claim);
      }
      const text = p.html.replace(/ /g, ' ');
      for (const hit of quoted(text)) {
        if (/\/(міс|рік|год)/.test(hit.context)) continue; // retainers and domain fees are not site prices
        if (exceptions.some((claim) => claim.includes(`від ${hit.value.toLocaleString('uk-UA').replace(/ /g, ' ')} ₴`)
          || claim.includes(`від ${hit.value / 1000} тис`))) continue;
        expect(CANON.has(hit.value), `${p.rel}: «від ${hit.value} ₴» — ${hit.context}`).toBe(true);
      }
    }
  });

  /**
   * A price is only right next to the right thing: /pricing/ sets what each category costs, so a page
   * may not put a landing's price on a business site. Keys are matched against the visible text.
   */
  const CATEGORY = [
    { re: /магазин custom|custom-магазин|магазин \(custom\)/gi, price: 80000, name: 'Інтернет-магазин (custom)' },
    { re: /AI-платформ/gi, price: 80000, name: 'AI-платформа' },
    { re: /інтернет-магазин|магазин/gi, price: 60000, name: 'Інтернет-магазин (fast-track)' },
    { re: /сайт-візитк|візитка/gi, price: 25000, name: 'Сайт-візитка' },
    { re: /бізнес-сайт/gi, price: 40000, name: 'Бізнес-сайт на Next.js' },
    { re: /чат-бот/gi, price: 15000, name: 'Чат-бот для сайту' },
    { re: /telegram-бот/gi, price: 20000, name: 'Telegram-бот + автоматизація' },
    { re: /лендінг/gi, price: 20000, name: 'Лендінг' },
  ];

  /**
   * «від 20 000 ₴ за лендінг» names the category after the price, a price card before it. When a
   * segment with no other price lists several categories («лендінг, візитка, бізнес-сайт чи магазин
   * — від 20 000 ₴»), the price quoted is the cheapest of them.
   */
  function categoryOf(before, after) {
    const ahead = /^\s*(₴\s*)?за\s/.test(after) ? after.slice(0, 45) : '';
    const found = (haystack) => {
      const hits = CATEGORY.flatMap((category, rank) =>
        [...haystack.matchAll(category.re)].map((m) => ({ category, rank, start: m.index, end: m.index + m[0].length })));
      // «магазин» and «магазин custom» over the same words are one mention: the more specific pattern wins
      // (CATEGORY is ordered specific-first), and between equals the longer match
      const kept = [];
      let rest = hits.slice();
      while (rest.length) {
        const best = rest.reduce((a, b) =>
          (b.rank < a.rank || (b.rank === a.rank && b.end - b.start > a.end - a.start)) ? b : a);
        kept.push(best);
        rest = rest.filter((h) => h.end <= best.start || h.start >= best.end);
      }
      return kept.sort((a, b) => a.start - b.start);
    };

    const forward = found(ahead);
    if (forward.length) return [forward[0].category];

    // only the clause this price belongs to: everything after the previous price or sentence end
    const boundaries = [...before.matchAll(/[₴.;!?][,;:\s]/g)];
    const segment = boundaries.length ? before.slice(boundaries[boundaries.length - 1].index + 1) : before;
    const listed = found(segment);
    if (!listed.length) return null;
    const distinct = [...new Map(listed.map((h) => [h.category.name, h.category])).values()];
    if (distinct.length > 1) return distinct;
    const last = listed[listed.length - 1];
    return segment.length - last.end <= 45 ? [last.category] : null;
  }

  it('each category carries its own price from /pricing/', () => {
    for (const p of pages) {
      // meta descriptions are shown in search results, so they are checked like visible text
      const meta = [...p.html.matchAll(/<meta[^>]+(?:name|property)="(?:description|og:description|twitter:description)"[^>]*content="([^"]*)"/g)]
        .map((m) => m[1]).join(' ');
      const text = (p.html.replace(/<[^>]+>/g, ' ') + ' ' + meta).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
      const exceptions = MARKET_CLAIMS[p.rel] ?? [];
      for (const m of text.matchAll(/від ([\d ]{3,9})₴|від ([\d ]{3,9}) ₴/g)) {
        const value = Number((m[1] ?? m[2]).replace(/ /g, ''));
        const before = text.slice(Math.max(0, m.index - 70), m.index);
        const window = before + text.slice(m.index, m.index + 70);
        if (/\/(міс|рік|год)/.test(window)) continue;
        if (exceptions.some((claim) => window.includes(claim.slice(0, 40)) || claim.includes(`від ${value / 1000} тис`))) continue;
        if (/цін[аи]\s*$/i.test(before)) { // «Ціни від …» — the entry price of the site
          expect(value, `${p.rel}: the entry price is the cheapest site on /pricing/ — ${window.trim()}`).toBe(20000);
          continue;
        }
        const categories = categoryOf(before, text.slice(m.index + m[0].length, m.index + m[0].length + 60));
        if (!categories) continue;
        const expected = Math.min(...categories.map((c) => c.price));
        const names = categories.map((c) => c.name).join(' / ');
        expect(value, `${p.rel}: «${names}» costs ${expected} on /pricing/ — ${window.trim()}`).toBe(expected);
      }
    }
  });

  it('every price in JSON-LD is one of them', () => {
    for (const p of pages) {
      for (const d of jsonLd(p.html)) {
        for (const { path, value } of ldPrices(d)) {
          if (value === 0) continue; // a case study's app marked as not sold, not a price of mine
          expect(CANON.has(value), `${p.rel}${path} = ${value}`).toBe(true);
        }
      }
    }
  });

  /** Offers name their category, so the pair «category → price» is checkable in structured data too. */
  it('every JSON-LD offer prices the category it names', () => {
    for (const p of pages) {
      for (const d of jsonLd(p.html)) {
        const offers = [];
        const walk = (node) => {
          if (Array.isArray(node)) return node.forEach(walk);
          if (!node || typeof node !== 'object') return;
          const price = Number(node.price ?? node.priceSpecification?.minPrice ?? NaN);
          const name = node.name ?? node.itemOffered?.name;
          if (Number.isFinite(price) && price > 0 && typeof name === 'string') offers.push({ name, price });
          Object.values(node).forEach(walk);
        };
        walk(d);
        for (const offer of offers) {
          const categories = categoryOf('', ` за ${offer.name}`) ?? categoryOf(offer.name, '');
          if (!categories) continue;
          const expected = Math.min(...categories.map((c) => c.price));
          expect(offer.price, `${p.rel}: offer «${offer.name}» is priced ${offer.price}, catalogue says ${expected}`)
            .toBe(expected);
        }
      }
    }
  });

  it('priceRange states a floor, never a ceiling', () => {
    let seen = 0;
    for (const p of pages) {
      for (const d of jsonLd(p.html)) {
        const range = JSON.stringify(d).match(/"priceRange":\s*"([^"]+)"/);
        if (!range) continue;
        seen += 1;
        // «20000-80000 UAH» reads as an upper bound, and there is none: 80 000 is itself a «від»
        expect(range[1], `${p.rel}: priceRange must not look like a closed range`).not.toMatch(/\d\s*[-–]\s*\d/);
        expect(range[1], `${p.rel}: priceRange starts at the cheapest site`).toMatch(/20[\s\u00a0]?000/);
      }
    }
    expect(seen, 'the business node must still declare a price floor').toBe(1);
  });

  /**
   * The delivery time /pricing/ publishes per category, read from its own comparison tables. Keyed by
   * category, not by price: a landing and a Telegram bot both start at 20 000 ₴ but take different time.
   */
  const TERMS = (() => {
    const out = {};
    const rows = [...page('pricing/index.html').html.matchAll(/<tr><td>([^<]+)<\/td><td>від ([\d\u00a0 ]+) ₴<\/td><td>([^<]+)<\/td>/g)];
    for (const [, rowName, , term] of rows) {
      const hits = CATEGORY.flatMap((category) => [...rowName.matchAll(category.re)].map((m) => ({ category, rank: CATEGORY.indexOf(category), len: m[0].length })));
      if (!hits.length) continue;
      const best = hits.reduce((a, b) => (b.rank < a.rank ? b : a));
      if (!(best.category.name in out)) out[best.category.name] = term.replace(/\u00a0/g, ' ').trim();
    }
    return out;
  })();

  /** «5-7 днів» and «5–7 днів» are the same promise; «7–14 днів» is a different one. */
  const termKey = (text) => (text.match(/\d+/g) ?? []).join('-') + (/тижн/i.test(text) ? 'w' : 'd');

  it('a delivery time named next to a category is the one /pricing/ publishes', () => {
    const commercial = pages.filter((p) => p.rel === 'index.html' || p.rel === 'pricing/index.html' || p.rel.startsWith('services/'));
    for (const p of commercial) {
      const text = p.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
      // only a promise about future work («Термін: …», «готово за …») — not a fact about a finished case
      for (const m of text.matchAll(/(?:Термін:|термін:|готово за)\s*(\d+(?:\s?[–-]\s?\d+)?\s*(?:днів|дні|день|тижні|тижнів|тиждень))/g)) {
        // a price card puts the category, the price and the term together, so the price is not a boundary here
        const before = text.slice(Math.max(0, m.index - 90), m.index);
        const hits = CATEGORY.flatMap((category) => [...before.matchAll(category.re)].map((x) => ({ category, end: x.index + x[0].length, rank: CATEGORY.indexOf(category) })));
        if (!hits.length) continue;
        const nearest = hits.reduce((a, b) => (b.end > a.end || (b.end === a.end && b.rank < a.rank) ? b : a));
        const categories = [nearest.category];
        const expected = TERMS[nearest.category.name];
        if (!expected) continue;
        expect(termKey(m[1]), `${p.rel}: «${categories.map((c) => c.name).join('/')} — ${m[1]}», /pricing/ says «${expected}»`)
          .toBe(termKey(expected));
      }
    }
  });

  it('the landing is promised in 5–7 days everywhere, as on /pricing/', () => {
    expect(page('pricing/index.html').html).toContain('<td>Лендінг</td><td>від 20 000 ₴</td><td>5-7 днів</td>');
    for (const p of pages) {
      const text = p.html.replace(/ /g, ' ');
      expect(text, `${p.rel} still promises a landing in exactly 7 days`).not.toMatch(/[Лл]ендінг[^<.]{0,40}за 7 днів/);
    }
  });
});
