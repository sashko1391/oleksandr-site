# oleksandr-site — Project Rules

## Project Context
- Static HTML site (no framework, no build step)
- Hosted on Vercel (vercel.json config)
- Domain: parkinsandr.tech
- Language: Ukrainian (uk), geo: Kyiv Oblast
- GA4: G-Y891WWYE79
- API: /api/send-chat.js (Vercel serverless)

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

### Sprint A (06.04–19.04): Measurement + Blockers
- [ ] Verify GSC access + link GSC ↔ GA4
- [ ] Export baseline Performance (28 days) — top queries/pages
- [ ] Check Page Indexing: list all "Not indexed" reasons for important URLs
- [ ] Run Screaming Frog crawl (200/301/404, titles, meta, directives)
- [x] Seed keywords (5 groups) + intent map table — doc/SEED_KEYWORDS.md
- [x] Fix: logo href="#" → href="/" on project/blog pages — all pages already have href="/"

### Sprint B (20.04–03.05): First Landing Pages + Fix Blockers
- [ ] Create landing page: "Розробка сайтів на Next.js для бізнесу" (own URL)
- [ ] Create landing page: "Лендінг під рекламу"
- [ ] Add 5 internal links from blog/cases to each new landing page
- [ ] Verify canonicals (1 URL = 1 canonical, no conflicts)
- [ ] Fix soft-404/404 issues (301 or fix)
- [ ] Add BreadcrumbList JSON-LD to all /blog/* and /projects/* pages

### Sprint C (04.05–17.05): CWV + Schema
- [ ] Run PSI on homepage + blog template + case template; backlog LCP/INP/CLS
- [ ] Verify/add Article schema on all blog posts (check dateModified accuracy)
- [ ] Create landing page: "AI-інтеграції для сайту"
- [ ] Update AGENTIS case study with SEO/indexing results
- [ ] 5 outreach emails to clients for credit links

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
- Article JSON-LD on all blog/project pages
- robots.txt allows all bots + sitemap reference
- sitemap.xml with 10 URLs, correct lastmod dates
- GA4 on all pages
- All images have descriptive alt text, WebP format
- Proper H1→H2→H3 hierarchy on all pages
- Skip link for accessibility
- Lazy loading on images

### What needs fixing:
- ~~Logo href="#" on project/blog pages~~ → FIXED (all pages have href="/")
- ~~No BreadcrumbList schema on inner pages~~ → FIXED (added to new pages; older pages need update)
- ~~No FAQPage schema anywhere~~ → FIXED (added to jarvis-ai-assistant)
- No dedicated service landing pages → PARTIALLY FIXED (3 service pages exist: nextjs, landing, ai)
- Homepage is one-page with #anchors — search engines can't index sections as separate entities
- ~~No related posts on blog articles~~ → FIXED (added to all blog posts)
- No AVIF format (only WebP + JPG)
- preview.jpg used in OG but not confirmed to exist
- No Schema @id cross-referencing between entities
- No Organization/Person @id on homepage for entity linking
- No GEO optimization (TL;DR blocks, citation strategy) on existing content
- Expertise-to-Ad Ratio not audited on key pages

## Technical Notes
- All CSS is inline (in `<style>` tags) — good for performance
- Google Fonts via preconnect
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

## Reference Documents
- `doc/SEO.md` — Full 3-month SEO plan with editorial calendar
- `doc/SEED_KEYWORDS.md` — 5 keyword groups + intent map
- `~/.claude/doc/Audit.md` — 3 audit prompts (quick/full/pre-release) for JS/TS projects
- `~/.claude/doc/SEO-стратегія*.pdf` — SEO strategy 2026: V.A.L.I.D., GEO, AI Overviews, Schema
- `~/.claude/doc/Навчання Claude Code*.pdf` — Claude Code SEO automation guide, CLAUDE.md templates
