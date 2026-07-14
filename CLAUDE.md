# oleksandr-site — Project Rules

## Project Context
- Static HTML site (no framework, no build step)
- Hosted on Vercel (vercel.json config)
- Domain: parkinsandr.tech
- Language: Ukrainian (uk), geo: Kyiv Oblast
- GA4: G-Y891WWYE79 + conversion tracking (generate_lead, contact_click, cta_click, chat_start, chat_message)
- Microsoft Clarity: w7i1iwx0ah
- Google Ads: акаунт створено (sashko1391@gmail.com), кампанії в підготовці
- API: /api/comments.js + /api/tg-webhook.js + /api/cron/comments-retention.js (Vercel serverless); чат/ліди → Cloudflare Worker (oleksandr-site.sashko1391.workers.dev). `/api/send-chat.js` видалено 2026-07-14 (осиротілий, без викликачів)

## File Structure
```
public/
├── index.html              ← homepage (one-page with sections)
├── 404.html                ← error page (noindex)
├── robots.txt
├── sitemap.xml
├── services/{slug}/index.html  ← service landing pages (3 pages)
├── projects/{slug}/index.html  ← case studies (4 pages)
├── blog/{slug}/index.html      ← blog posts (6 pages)
└── images/                     ← WebP + JPG fallbacks
```

## SEO Plan (April–June 2026) — Reference: doc/SEO.md

### Sprint A (06.04–19.04): Measurement + Blockers ✅
- [x] Verify GSC access + link GSC ↔ GA4 — done 2026-04-08
- [x] Check Page Indexing — 3 redirects (normal), 5 "discovered not indexed" → requested indexing for 9 URLs
- [x] Sitemap resubmitted (14 URLs) — 2026-04-08
- [ ] Export baseline Performance (28 days) — too little data yet (1 click total), revisit in 2 weeks
- [ ] Run Screaming Frog crawl (200/301/404, titles, meta, directives) — optional, site is small
- [x] Seed keywords (5 groups) + intent map table — doc/SEED_KEYWORDS.md
- [x] Fix: logo href="#" → href="/" on project/blog pages — all pages already have href="/"
- [x] Schema @id cross-referencing — Person @id on homepage, referenced from all 9 inner pages
- [x] robots.txt — explicit Allow for GPTBot, ChatGPT-User, Claude-Web
- [x] GEO TL;DR blocks — added to key articles
- [x] Expertise-to-Ad Ratio audit — all pages PASS (45-55%)

### Sprint B (20.04–03.05): First Landing Pages + Fix Blockers ✅
- [x] Create landing page: "Розробка сайтів на Next.js для бізнесу" — /services/nextjs/ (already exists)
- [x] Create landing page: "Лендінг під рекламу" — /services/landing/ (already exists)
- [x] Add 5+ internal links to each service page — nextjs:7, landing:4, ai:5
- [x] Verify canonicals — all 14 pages OK, no conflicts
- [x] Fix soft-404/404 issues — 0 broken internal links
- [x] Add BreadcrumbList JSON-LD to all /blog/* and /projects/* pages — done (100% coverage)

### Sprint C (04.05–17.05): CWV + Schema ✅
- [x] Run PSI on homepage + blog template + case template — react-vs-tilda: P93/A79/LCP2.6s, ace: P75/A81/LCP5.1s
- [x] Accessibility fixes on all 14 pages: skip-link, aria-labels, main landmark, contrast, table semantics
- [x] LCP optimization: analytics to body end, font preload split
- [x] Article schema audit — all 8 blog posts have Article + BreadcrumbList + Person @id refs; dateModified matches git log (verified 2026-05-04)
- [x] Landing page "AI-інтеграції для сайту" — /services/ai/ exists, expanded with 3 FAQ items (RAG vs simple bot, GDPR/data, AI vs n8n) on 2026-05-04
- [x] Update AGENTIS case study with SEO/indexing results — done 2026-05-04 (commit e4fdeb3): GSC data 1→58 indexed, 75 clicks / 4 229 impressions / CTR 1.77% / pos 10.8 over 28 days
- [x] Re-run PSI after deploy — homepage P89/A96/LCP3.0s, blog P90/A91/LCP2.7s, ace P75/A91/LCP4.9s; accessibility +10-12 points across templates
- [N/A] 5 outreach emails for credit links — credits already live on all client sites (Atlas, AGENTIS, Slavutych, ACE, Julia), no outreach needed

### Sprint D (18.05–31.05): Cluster Structure
- [ ] Create landing page: "Редизайн і перезапуск"
- [ ] Publish tutorial: internal linking + cluster building
- [ ] Link all landing pages into Hub & Spoke structure
- [ ] Verify JS SEO: key content visible in URL Inspection
- [ ] 3 PR pitches (guide/calculator/research)

### Sprint E (01.06–14.06): Local SEO
- [ ] Create/update Google Business Profile (service area: Kyiv Oblast)
- [ ] Create local landing page: "Розробка сайтів Київ"
- [ ] Add LocalBusiness/ProfessionalService schema (truthful data only)
- [ ] Publish 2 blog posts + 1 case update

### Sprint F (15.06–28.06): Conversion Optimization
- [ ] A/B test: hero headline variants → measure lead rate
- [ ] A/B test: CTA text → measure CTR + leads
- [ ] Update 5 key pages: rewrite title/description for CTR
- [ ] Publish pillar guide: "Як замовити сайт і не згоріти"
- [ ] Update all landing pages: FAQ blocks, anchor links, CTAs
- [ ] 3-month report: clicks/impressions/leads growth, plan for Q3

## Content Calendar — Reference: doc/SEO.md (full table)

Priority content types:
1. **Landing pages** (services/niches) — close commercial intent
2. **Case studies** — proof of results + branded queries
3. **Tutorials/guides** — capture demand you don't buy via ads
4. **Blog posts** (guides/comparisons/devlogs) — topical authority

Target cadence: 1 deep + 1 light piece per week (8-10/month)

## Current SEO State (Baseline April 2026)

### What's already good:
- All pages have unique title + description + canonical + OG + Twitter Card
- ProfessionalService JSON-LD on homepage with offers
- Article JSON-LD on all blog/project pages with @id cross-referencing
- BreadcrumbList JSON-LD on all inner pages
- robots.txt allows all bots + sitemap reference
- sitemap.xml with 14 URLs, correct lastmod dates
- GA4 + Clarity on all pages + conversion tracking (5 custom events)
- All images have descriptive alt text, WebP format
- Proper H1→H2→H3 hierarchy on all pages
- Skip link, aria-labels, `<main>` landmark, WCAG AA contrast on all pages
- Analytics scripts at end of `<body>` (not `<head>`) for better LCP
- Self-hosted fonts in `/public/fonts/` (woff2, inline @font-face) — Playfair Display (headings), Manrope (body), JetBrains Mono (mono); all with Cyrillic subset
- Lazy loading on images

### What needs fixing:
- Homepage is one-page with #anchors — search engines can't index sections as separate entities
- No AVIF format (only WebP + JPG)
- preview.jpg used in OG but not confirmed to exist

## Technical Notes
- All CSS is inline (in `<style>` tags) — good for performance
- Fonts self-hosted in `/public/fonts/` (no Google Fonts dependency); @font-face inline, critical Cyrillic woff2 preloaded; `vercel.json` sets immutable cache on `/fonts/*`
- No external CSS/JS files except GA4
- deploy.sh and update.sh for SSH deployment
- vercel.json for routing config

## Conventions
- HTML files go in public/{section}/{slug}/index.html
- Images in public/images/ as WebP (primary) + JPG (fallback)
- JSON-LD schemas inline in `<script type="application/ld+json">`
- Ukrainian content, English code/config
- Meta description: keyword at start, <155 chars
- Title: <60 chars, pattern "{Topic} | Олександр Кравченко"

## V.A.L.I.D. Framework (Algorithm Resilience)

Every page must pass all 5 pillars:

| Pillar | Check |
|--------|-------|
| **V** — Verification (E-E-A-T) | Author credentials, real case studies, unique screenshots, first-person analytics |
| **A** — Accessibility & UX | CWV in "Good" (LCP<2.5s, INP<200ms, CLS<0.1), mobile-first, skip links |
| **L** — Logic & Structure | Schema Markup with @id cross-references, heading hierarchy H1→H2→H3 |
| **I** — Intent Alignment | Content matches user intent (commercial→landing, info→guide, local→city page) |
| **D** — Depth & Differentiation | Information Gain — unique data, original insights, not available elsewhere |

## GEO (Generative Engine Optimization)

Rules for AI Overviews / AI-citation visibility:

1. **TL;DR first:** Each H2 section starts with 2 sentences directly answering the heading question, then expands
2. **Modular content:** Use comparison tables, numbered lists, feature grids — easy for AI extraction
3. **Citation strategy:** Reference authoritative sources (+40% visibility), include specific statistics (+37%), use expert quotes with attribution (+30%), use precise technical terminology (+28%)
4. **Entity-first headings:** Full entity names in H1 and opening paragraphs (helps NER). No pronouns in headings
5. **Query fan-out coverage:** Cover subtopics deeply — AIO visibility depends on answering sub-questions, not ranking for one term
6. **Expertise-to-Ad Ratio:** Top 800px of page must have >35% original expert content (not CTAs or ads)

## Schema Architecture (Enhanced)

### Cross-referencing with @id
All JSON-LD blocks must use `@id` to link entities across the site:

```json
// Homepage: define the Person entity
{"@type": "Person", "@id": "https://www.parkinsandr.tech/#author", "name": "Олександр Кравченко"}

// Blog post: reference the same Person
{"@type": "Article", "author": {"@id": "https://www.parkinsandr.tech/#author"}}
```

### Required schema per page type
| Page type | Required schemas | Optional |
|-----------|-----------------|----------|
| Homepage | ProfessionalService, Person (with @id) | Organization |
| Blog post | Article, BreadcrumbList | FAQPage (if Q&A content) |
| Case study | Article, BreadcrumbList | — |
| Service landing | Service, BreadcrumbList, FAQPage | HowTo |
| Local landing | LocalBusiness, BreadcrumbList | — |

### Schema quality rules
- Use 4+ unique JSON-LD types per page for higher AI Overview inclusion (+14%)
- Never use fake data — only truthful, verifiable information
- Update dateModified when content actually changes
- Test with Rich Results Test after every schema change

## SEO Metrics & KPI (2026)

### Traditional metrics (GSC + GA4)
- Organic clicks/impressions/CTR by page (Search Console Performance)
- Core Web Vitals pass rate (CWV report)
- Indexing coverage (Page Indexing report)
- Key events: form submit, contact click, chat interaction (GA4)

### AI-era metrics (new)
- **Share of Model (SoM):** % of brand mentions in AI responses for 20-50 target queries across ChatGPT, Perplexity, Claude, Gemini. Track monthly
- **AI Citation Frequency:** How often domain is cited as source by AI platforms
- **Generative Referral Traffic:** Traffic from AI-generated links (GA4 referral)

## 2026 SEO/GEO/CWV Policy Sync
> Source of truth: `~/Dashboard/knowledge/` (SEO/GEO/sites master guides). Global policy in `~/.claude/CLAUDE.md` governs behavior; this block mirrors the mid-2026 deltas most relevant to this static content-led site. Synced from Dashboard knowledge as of 2026-06-14. Re-sync when `~/Dashboard/knowledge/_refresh-manifest.json` shows a newer `last_refresh`.

### Search/GEO landscape (mid-2026)
- **"Getting Cited" replaces "Ranking":** AI reads top-of-page + H2 blocks → answer-first перші абзаци + чіткі H2/списки прямо корелюють з частотою цитування в ChatGPT/Perplexity/Gemini. E-E-A-T author blocks = "нові беклінки" для source selection.
- **AI Mode 5 (May 2026):** inline citations *всередині* AI-тексту (не в кінці) → потрібні короткі цитатопридатні речення з marked facts; "explore more" chain; site previews on hover → клікабельні title/OG-title критичні.
- **May 2026 Core Update:** crackdown на scaled/hyperscaled AI-контент. Commodity thin content deprecated (Google explicit). Priority: unique data, own research, кейси, high entity density, first-hand signals.
- **AI Overviews CTR:** informational CTR впав ~65% де показано AIO. CTR більше не надійний proxy — сегментувати by AIO/no-AIO, дивитись downstream (lead capture, repeat visit, activation).
- **Cluster: adaptive depth > symmetric** — scale winners (high intent + performance), weaker subtopics лишати minimal. Smaller intent-dense > mass programmatic.

### Schema (2026)
- Focus: **Article, FAQPage, HowTo, BreadcrumbList, Organization/ProfessionalService, LocalBusiness**. Quiz/Practice Problems schema **deprecated** (Jan 2026). Aim 4+ unique JSON-LD types/page. Truthful data only.

### CWV targets (2026 gold)
- LCP <2.5s · **INP <200ms** (measures ALL interactions across page lifecycle, FID gone) · CLS <0.1 · TTFB optimal.
- **JS budget ≤300-400 KB gzipped/route** (было 500KB+). HTTP/3 + Brotli standard. **Priority Hints:** `fetchpriority="high"` на LCP-зображенні, explicit preconnect/dns-prefetch для third-party, `fetchpriority="low"` для below-fold. Edge target sub-50ms.
- Site-specific урок: **НЕ додавати `<link rel="preload" as="font">`** — text-LCP сторінки, self-hosted шрифти + `font-display:swap` рендерять fallback миттєво; font-preload конкурував з документом і піднімав FCP (див. [[project_site_stack]]).

### Trust signals (для YMYL/expert контенту)
- Порядок сили: посилання на закони/норми → чіткий дисклеймер (у видимій зоні, не футер) → прозорість методології → зовнішні джерела → кейси → команда з credentials. Human-in-the-loop framing: "готуємо до [professional], не замінюємо".

## Reference Documents
- `~/Dashboard/knowledge/` — **источник правди** для SEO/GEO/coding/marketing політик (master guides + `_refresh-manifest.json` з consumers та `last_refresh`)
- `~/Dashboard/prompts/coding_standards.md` (CODING_STANDARDS_2026) + `coding_specs.md` (PAGE_STANDARD_2026)
- `doc/SEO.md` — Full 3-month SEO plan with editorial calendar
- `doc/SEED_KEYWORDS.md` — 5 keyword groups + intent map
- `~/.claude/doc/Audit.md` — 3 audit prompts (quick/full/pre-release) for JS/TS projects
- `~/.claude/doc/SEO-стратегія*.pdf` — SEO strategy 2026: V.A.L.I.D., GEO, AI Overviews, Schema
- `~/.claude/doc/Навчання Claude Code*.pdf` — Claude Code SEO automation guide, CLAUDE.md templates
