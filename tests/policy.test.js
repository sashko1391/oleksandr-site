// Static policy checks that enforce the rules tagged `[enforced: tests/policy.test.js]` in AGENTS.md.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { maskInert } from '../scripts/inject-rss.mjs';

const PUBLIC = join(process.cwd(), 'public');
const SITE = 'https://www.parkinsandr.tech';
const LADOMYR_ID = 'https://www.ladomyr.kiev.ua/#business';

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
const indexable = pages.filter(
  (p) => !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(p.html)
);

/** 'journal/x/index.html' → '/journal/x/', 'index.html' → '/' */
const urlOf = (rel) => '/' + rel.replace(/index\.html$/, '');

/** Every "@id" string inside the page's JSON-LD blocks (parsed, not regexed). */
function ldIds(html) {
  const ids = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      if (typeof n['@id'] === 'string') ids.push(n['@id']);
      Object.values(n).forEach(walk);
    }
  };
  const re = /<script\b[^>]*\btype\s*=\s*['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) walk(JSON.parse(m[1]));
  return ids;
}

describe('policy: fonts', () => {
  it('no <link rel="preload" as="font"> on any page', () => {
    const bad = pages.filter((p) => /<link\b[^>]*\bas\s*=\s*["']font["']/i.test(p.html)).map((p) => p.rel);
    expect(bad).toEqual([]);
  });
});

describe('policy: stable @id', () => {
  const all = indexable.flatMap((p) => ldIds(p.html).map((id) => ({ rel: p.rel, id })));

  it('legacy Person @id /#author is not used anywhere', () => {
    expect(all.filter((x) => x.id === `${SITE}/#author`)).toEqual([]);
  });
  it('Person entity is defined on /pro-mene/', () => {
    const page = indexable.find((p) => p.rel === 'pro-mene/index.html');
    expect(ldIds(page.html)).toContain(`${SITE}/pro-mene/#author`);
  });
  it('every #business @id is either ours or the Ladomyr client entity', () => {
    const allowed = new Set([`${SITE}/#business`, LADOMYR_ID]);
    expect(all.filter((x) => x.id.endsWith('#business') && !allowed.has(x.id))).toEqual([]);
  });
  it('the Ladomyr client entity @id stays exactly as is: twice, only in its case', () => {
    expect(all.filter((x) => x.id === LADOMYR_ID).map((x) => x.rel)).toEqual([
      'projects/ladomyr/index.html',
      'projects/ladomyr/index.html',
    ]);
  });
});

describe('policy: discovery', () => {
  const locs = [...readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('sitemap has no duplicate URLs', () => {
    expect(locs.length).toBe(new Set(locs).size);
  });
  it('sitemap lists exactly the indexable pages', () => {
    expect(new Set(locs)).toEqual(new Set(indexable.map((p) => SITE + urlOf(p.rel))));
  });
  it('every indexable page links /feed.xml exactly once in <head>, as a real rss alternate', () => {
    const bad = indexable
      .filter((p) => {
        // commented-out and script-embedded markup is not a link
        const head = (maskInert(p.html).match(/<head[\s>][\s\S]*?<\/head>/i) || [''])[0];
        const rss = (head.match(/<link\b[^>]*>/gi) || []).filter(
          (t) =>
            /\brel\s*=\s*["']alternate["']/i.test(t) &&
            /\btype\s*=\s*["']application\/rss\+xml["']/i.test(t) &&
            /\bhref\s*=\s*["']\/feed\.xml["']/i.test(t)
        );
        return rss.length !== 1;
      })
      .map((p) => p.rel);
    expect(bad).toEqual([]);
  });
});

describe('policy: scheduled jobs', () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));

  it('every cron path ends with a slash — trailingSlash would redirect it into nothing', () => {
    // Vercel Cron does not follow the 308 that trailingSlash:true produces, so a path without the
    // slash means the job silently never runs.
    expect(vercel.trailingSlash).toBe(true);
    for (const cron of vercel.crons) {
      expect(cron.path, `${cron.path} would be redirected, not executed`).toMatch(/\/$/);
    }
  });

  it('every cron path points at a handler that exists', () => {
    for (const cron of vercel.crons) {
      const file = join(process.cwd(), cron.path.replace(/^\//, '').replace(/\/$/, '') + '.js');
      expect(existsSync(file), `${cron.path} has no handler at ${file}`).toBe(true);
    }
  });
});

describe('policy: security headers', () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
  const rule = vercel.headers[0];
  const header = (key) => rule.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
  const cspKey = rule.headers.map((h) => h.key).find((k) => /^Content-Security-Policy(-Report-Only)?$/.test(k));
  /** 'script-src a b; img-src c' → { 'script-src': ['a', 'b'], 'img-src': ['c'] } */
  const csp = Object.fromEntries(
    (header(cspKey ?? '') ?? '').split(';').map((d) => d.trim()).filter(Boolean)
      .map((d) => { const [name, ...values] = d.split(/\s+/); return [name, values]; })
  );
  /** Does a CSP source list allow this origin? Handles 'self', exact origins and https://*.host wildcards. */
  const allows = (directive, origin) => {
    const list = csp[directive] ?? csp['default-src'] ?? [];
    if (origin === 'self') return list.includes("'self'");
    const { protocol, hostname } = new URL(origin);
    return list.some((src) => {
      const m = src.match(/^(https?:)\/\/(\*\.)?([^/:]+)$/);
      if (!m || m[1] !== protocol) return false;
      return m[2] ? hostname.endsWith(`.${m[3]}`) : hostname === m[3];
    });
  };
  /** Executable code of the site: inline <script> bodies (not JSON-LD, not src=) and the first-party /js files. */
  const code = [
    ...pages.flatMap((p) =>
      [...p.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter((m) => !/\bsrc\s*=/.test(m[1]) && !/application\/ld\+json/.test(m[1]))
        .map((m) => ({ where: `${p.rel} (inline)`, text: m[2] }))
    ),
    ...readdirSync(join(PUBLIC, 'js')).filter((n) => n.endsWith('.js'))
      .map((n) => ({ where: `js/${n}`, text: readFileSync(join(PUBLIC, 'js', n), 'utf8') })),
  ];
  const originsIn = (text) => [...text.matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0].toLowerCase());

  it('one rule covers every page and skips /api/, whose functions set their own (no-referrer on token pages)', () => {
    expect(rule.source).toBe('/((?!api/).*)');
    const keys = rule.headers.map((h) => h.key.toLowerCase());
    for (const other of vercel.headers.slice(1)) {
      for (const h of other.headers) expect(keys, `${other.source} must not override ${h.key}`).not.toContain(h.key.toLowerCase());
    }
  });

  it('sets the fixed headers to exactly these values', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    // only features Chrome knows: an unknown one (interest-cohort) is a console error on every page
    expect(header('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });

  it('carries exactly one CSP, and Report-Only has none of the directives it would ignore with a console error', () => {
    const csps = rule.headers.filter((h) => /^Content-Security-Policy/i.test(h.key));
    expect(csps).toHaveLength(1);
    if (cspKey === 'Content-Security-Policy-Report-Only') {
      for (const d of ['frame-ancestors', 'upgrade-insecure-requests', 'sandbox']) expect(csp[d], d).toBeUndefined();
    } else {
      // enforce: the two directives report-only had to leave out (plan, step 3) must be back
      expect(csp['frame-ancestors']).toEqual(["'none'"]);
      expect(csp['upgrade-insecure-requests']).toEqual([]);
    }
  });

  it('is strict where it can be: no wildcards, no http:, no eval, no plugins, no foreign <base> or form target', () => {
    for (const [name, values] of Object.entries(csp)) {
      for (const v of values) {
        expect(v, name).not.toBe('*');
        expect(v, name).not.toMatch(/^http:/);
        expect(v, name).not.toBe("'unsafe-eval'");
      }
    }
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });

  it('allows every external script the pages load, and every origin their code talks to', () => {
    const scripts = pages.flatMap((p) =>
      [...p.html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https:\/\/[^/"']+)/gi)].map((m) => ({ where: p.rel, origin: m[1] }))
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(allows('script-src', s.origin), `${s.where}: ${s.origin}`).toBe(true);
    // A literal origin in executable code is fetched, framed or injected as a script somewhere: one of the
    // fetch directives must name it. (Link targets live in HTML attributes, not in code, so none are caught here.)
    const fetchers = ['script-src', 'connect-src', 'frame-src', 'img-src', 'media-src'];
    const missing = [];
    for (const { where, text } of code) {
      for (const origin of originsIn(text)) {
        if (!fetchers.some((d) => allows(d, origin))) missing.push(`${where}: ${origin}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('names each third party in the directive it actually needs', () => {
    expect(allows('script-src', 'https://www.googletagmanager.com')).toBe(true);
    expect(allows('connect-src', 'https://region1.google-analytics.com')).toBe(true);
    // GA4 also collects on the bare domain, which a *.analytics.google.com wildcard does not cover (check:csp, 2026-10-12)
    expect(allows('connect-src', 'https://analytics.google.com')).toBe(true);
    // with ad consent denied, the Ads conversion of a lead is a cookieless ping to one fixed host
    expect(allows('connect-src', 'https://pagead2.googlesyndication.com')).toBe(true);
    expect(allows('img-src', 'https://pagead2.googlesyndication.com')).toBe(true); // the image fallback, other browsers
    // …and nothing of Signals: no doubleclick, no Google domain of any country (consent default, D10)
    for (const origin of ['https://stats.g.doubleclick.net', 'https://www.google.com', 'https://www.google.com.ua']) {
      expect(allows('connect-src', origin) || allows('img-src', origin), origin).toBe(false);
    }
    expect(allows('script-src', 'https://www.clarity.ms')).toBe(true); // the tag
    expect(allows('script-src', 'https://scripts.clarity.ms')).toBe(true); // the recorder it loads
    expect(allows('connect-src', 'https://x.clarity.ms')).toBe(true); // the upload
    expect(allows('script-src', 'https://challenges.cloudflare.com')).toBe(true); // Turnstile api.js
    expect(allows('frame-src', 'https://challenges.cloudflare.com')).toBe(true); // …and its widget
    expect(allows('frame-src', 'https://www.youtube-nocookie.com')).toBe(true); // the video facade
    expect(allows('media-src', 'self')).toBe(true); // /audio/*.mp3, /video/*.mp4
    const worker = code.some(({ text }) => text.includes('workers.dev'));
    expect(allows('connect-src', 'https://oleksandr-site.sashko1391.workers.dev'), 'the lead Worker, while anything calls it').toBe(worker);
  });
});

describe('policy: analytics without ad signals', () => {
  // No ads are run or planned. With ad consent denied by default GA4 still counts pages, but sends nothing to
  // doubleclick and nothing to the visitor's country Google domain (google.de, google.pl…), which no CSP could list
  // in full. allow_google_signals:false in config was tried first and changed nothing (check:csp, 2026-10-12).
  it('every page denies ad storage, ad user data and ad personalisation before GA4 starts', () => {
    for (const p of pages) {
      const snippet = p.html.match(/gtag\(\s*["']consent["'][\s\S]*?gtag\(\s*["']config["']/)?.[0];
      expect(snippet, `${p.rel}: consent default must come before js/config`).toBeTruthy();
      const defaults = snippet.match(/gtag\(\s*["']consent["']\s*,\s*["']default["']\s*,\s*\{([^}]*)\}/)?.[1] ?? '';
      for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization']) {
        expect(defaults, `${p.rel}: ${key}`).toMatch(new RegExp(`${key}:\\s*["']denied["']`));
      }
      expect(defaults, `${p.rel}: page analytics itself stays on`).not.toMatch(/analytics_storage:\s*["']denied["']/);
      // one default, and exactly in this order: consent, then js, then config — later commands see the default
      const at = (re) => p.html.search(re);
      expect((p.html.match(/gtag\(\s*["']consent["']\s*,\s*["']default["']/g) || []).length, p.rel).toBe(1);
      expect(at(/gtag\(\s*["']consent["']/), p.rel).toBeLessThan(at(/gtag\(\s*["']js["']/));
      expect(at(/gtag\(\s*["']js["']/), p.rel).toBeLessThan(at(/gtag\(\s*["']config["']/));
    }
  });
});

describe('policy: trailing slash on /api/*', () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));

  it('every /api/ rewrite source ends with a slash — redirects run before rewrites', () => {
    // trailingSlash:true answers /api/event with a 308 to /api/event/ before any rewrite is tried, so a
    // slashless source never matches and the slashed URL falls through to a 404 (Plausible, 2026-09-21).
    const api = vercel.rewrites.filter((r) => r.source.startsWith('/api/'));
    expect(api.length, 'the Plausible proxy is expected among the rewrites').toBeGreaterThan(0);
    for (const r of api) expect(r.source, `${r.source} is shadowed by the 308`).toMatch(/\/$/);
  });

  it('every /api/ path the browser can call carries the slash before its query', () => {
    // Any quoted '/api/…' literal in a page or a public script — a fetch argument or a constant that
    // feeds one. Without the slash each call pays a 308 (comments.v1.js did, until v2).
    const jsFiles = readdirSync(join(PUBLIC, 'js'))
      .filter((n) => n.endsWith('.js'))
      .map((n) => ({ rel: `js/${n}`, html: readFileSync(join(PUBLIC, 'js', n), 'utf8') }));
    const bad = [];
    for (const { rel, html } of [...pages, ...jsFiles]) {
      for (const m of html.matchAll(/(['"`])(\/api\/[^'"`\s]*)\1/g)) {
        const path = m[2].split('?')[0];
        if (!path.endsWith('/')) bad.push(`${rel}: ${m[2]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the Plausible snippet on every page posts to the slashed proxy', () => {
    const snippets = pages.flatMap((p) =>
      [...p.html.matchAll(/\bdata-api\s*=\s*["']([^"']*)["']/gi)].map((m) => ({ rel: p.rel, api: m[1] }))
    );
    expect(snippets.length, 'every page carries the Plausible snippet').toBe(pages.length);
    for (const s of snippets) expect(s.api, s.rel).toBe('/api/event/');
  });
});

describe('embedded videos', () => {
  const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n');

  it('a page plays only the video its schema is about (regression: a copied handler played another song)', () => {
    const withVideo = pages.filter((p) => p.html.includes('youtube-nocookie.com/embed/'));
    expect(withVideo.length, 'the facade pages disappeared?').toBeGreaterThanOrEqual(3);
    for (const { rel, html } of withVideo) {
      const embedded = [...new Set([...html.matchAll(/youtube-nocookie\.com\/embed\/([\w-]{11})/g)].map((m) => m[1]))];
      expect(embedded, `${rel}: more than one video behind the play button`).toHaveLength(1);
      expect(ld(html), `${rel}: plays ${embedded[0]}, which its JSON-LD never mentions`).toContain(embedded[0]);
    }
  });
});

describe('moved URLs (AGENTS rule 1: a move is 1:1, through a permanent redirect)', () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
  const onDisk = (url) => {
    const path = join(PUBLIC, url.replace(/^\//, ''));
    return url.endsWith('/') ? existsSync(join(path, 'index.html')) : existsSync(path);
  };

  it('every redirect is permanent and lands on a file that exists', () => {
    for (const r of vercel.redirects ?? []) {
      expect(r.permanent, `${r.source} must be a 308`).toBe(true);
      expect(r.destination, `${r.source}: relative, canonical destination`).toMatch(/^\/[^?#]*$/);
      expect(onDisk(r.destination), `${r.source} → ${r.destination}, which does not exist`).toBe(true);
    }
  });

  it('the old address is gone from disk and from the sitemap — nothing left for the redirect to shadow', () => {
    const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');
    for (const r of vercel.redirects ?? []) {
      const old = r.source.replace('(/?)', '/');
      expect(onDisk(old), `${old} still exists — which one is real?`).toBe(false);
      expect(sitemap, `${old} is still in the sitemap`).not.toContain(`${SITE}${old}<`);
    }
  });
});
