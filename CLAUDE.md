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
├── projects/{slug}/index.html  ← case studies (4 pages)
├── blog/{slug}/index.html      ← blog posts (5 pages)
└── images/                     ← WebP + JPG fallbacks
```

## SEO Plan (April–June 2026) — Reference: doc/SEO.md

### Sprint A (06.04–19.04): Measurement + Blockers
- [ ] Verify GSC access + link GSC ↔ GA4
- [ ] Export baseline Performance (28 days) — top queries/pages
- [ ] Check Page Indexing: list all "Not indexed" reasons for important URLs
- [ ] Run Screaming Frog crawl (200/301/404, titles, meta, directives)
- [ ] Seed keywords (5 groups) + intent map table
- [ ] Fix: logo href="#" → href="/" on project/blog pages

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
- Logo href="#" on project/blog pages → should be "/"
- No BreadcrumbList schema on inner pages
- No FAQPage schema anywhere
- No dedicated service landing pages (homepage uses anchor sections)
- Homepage is one-page with #anchors — search engines can't index sections as separate entities
- No related posts on blog articles
- No AVIF format (only WebP + JPG)
- preview.jpg used in OG but not confirmed to exist

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
