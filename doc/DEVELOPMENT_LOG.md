# Development Log

## 2026-04-05 — SEO-аудит, UI/UX покращення, контент, WebP

### SEO-аудит та виправлення
- Створено SVG favicon (`/favicon.svg`) з ініціалами "OK" — додано на всі 6 сторінок
- Додано Twitter Card теги (card, title, description, image) на 5 сторінок (проєкти + блог)
- Додано `og:image` на agentis, обидві статті блогу
- Створено кастомну 404 сторінку (`/404.html`) у стилі сайту
- Скорочено `<title>` до 50-60 символів на всіх сторінках
- Скорочено `<meta description>` до 150-160 символів
- Додано `width`/`height` + `loading="lazy"` на зображення slavutych project page
- Додано `<meta name="theme-color">` на 5 сторінок
- Виправлено ієрархію заголовків H4 → H3 на всіх проєктних сторінках (agentis, ace, slavutych)
- Додано `rel="noopener noreferrer"` на зовнішні посилання (agentis, Telegram, WhatsApp)
- Оновлено `sitemap.xml` з `lastmod` датами для кожної URL
- Додано `publisher` field до JSON-LD structured data на всіх article-сторінках
- Оновлено structured data на головній: `priceRange`, ціни в `Offer` (UAH), `sameAs` з GitHub

### UI/UX покращення (за рекомендаціями ChatGPT + Grok)
- Додано "Блог" в навігацію (між "Про мене" та CTA)
- Підсилено `box-shadow` на всіх типах карток (scenario, about, testimonial, blog) — базова тінь + stronger hover
- Створено секцію "Вартість" з 3 тарифами: Стартовий (20K), Оптимальний (30K), Максимальний (40K UAH)
- Покращено hero visual: глибша тінь на сфері, кращий gradient, символ `</>`

### Контент
- Стаття: "Скільки коштує сайт у 2026" (`/blog/skilky-koshtuye-sajt/`) — порівняльна таблиця 3 рівнів, перелік робіт, приховані витрати
- Стаття: "Devlog: Business Empire Idle" (`/blog/devlog-business-empire-idle/`) — девлог розробки idle-гри на SvelteKit, технічні рішення, 13 бізнесів, prestige, тести
- Обидві додані в блог-секцію на головній (тепер 4 статті) та sitemap

### Performance
- Конвертовано всі 6 портфоліо зображень з JPG у WebP (616K → 223K, -64%)
- Додано скріншот гри `empire-idle.webp` (39K) до devlog статті
- Оновлено всі `<img src>` та OG meta на `.webp`

### Git remote
- Переключено remote з HTTPS на SSH (`git@github.com:sashko1391/oleksandr-site.git`)

## 2026-04-06 — Нові кейси, девлоги, GA4

### Нові проєкти в портфоліо
- Створено кейс-сторінку `/projects/atlas/` — e-commerce магазин за 4 дні (Next.js 16, Medusa.js, НП, COD)
  - Dark theme з бронзовою палітрою (#C4841D)
  - Скріншот atlas.webp (29K, обрізаний від browser chrome)
  - 8 фіч-карток, AIDA-воронка, порівняння з Shopify
- Додано Atlas в портфоліо-grid на головній (між Славутич і SVENGO)

### Нові статті блогу
- `/blog/devlog-empire-online/` — девлог Empire Online (браузерна MMO): 150+ модулів, політика, коаліції, сезони, 2182 тести
  - Скріншот empire-online.webp (39K)
- Тепер на сайті 5 статей блогу і 5 проєктів у портфоліо

### Google Analytics 4
- Підключено GA4 (G-Y891WWYE79) на всі 11 HTML-сторінок
- Скрипт gtag.js додано перед `</head>`

### Sitemap
- Додано `/projects/atlas/` та `/blog/devlog-empire-online/` в sitemap.xml

## 2026-04-06 — SEO Sprint A: інфраструктура, сервісні сторінки, аналітика

### SEO Kit інтеграція
- Додано SEO-блок у глобальний `~/.claude/CLAUDE.md`:
  - Guardrails (meta, headings, images, URLs, schema, canonical, robots)
  - Internal Linking Policy (Hub & Spoke)
  - AI Readiness / GEO правила
  - Core Web Vitals цілі 2026
  - Trigger-Action правила (seo, seo audit, seo meta, seo schema, seo speed, seo links, seo fix, seo report)
  - On-Page шаблони (формули title, description, H2-структура)
  - JSON-LD templates (Article, BreadcrumbList, FAQPage)
  - Щотижневий/щомісячний SEO-ритуал
  - Safe Link Building Principles
- Створено 2 slash-команди: `/seo-audit` (повний аудит 5 зон), `/seo-cluster` (Hub & Spoke кластери)
- Створено проєктний `CLAUDE.md` з деталями oleksandr-site та SEO sprint-планом

### Нові сервісні landing pages (3 сторінки)
- `/services/nextjs/` — Розробка сайтів на Next.js для бізнесу
- `/services/landing/` — Лендінг під рекламу за 7 днів
- `/services/ai/` — AI-інтеграції для сайту (чат-бот, форми, CRM)
- Кожна з: Service + BreadcrumbList + FAQPage JSON-LD, hero, feature grid (6 карток), process pipeline, pricing, FAQ (5 Q&A), CTA banner
- Light theme, responsive, Clarity + GA4

### BreadcrumbList JSON-LD
- Додано BreadcrumbList schema на всі 9 inner pages (5 блог + 4 проєкти)

### Related posts
- Додано секцію "Читайте також" у всі 5 блог-статей
- 3 related posts на кожну статтю з описовими анкорами (+15 внутрішніх посилань)
- CSS-стилі .related-posts інтегровані у кожну сторінку

### Microsoft Clarity
- Підключено Clarity (w7i1iwx0ah) на всі 11 HTML-сторінок (перед GA4 скриптом)

### Внутрішня перелінковка
- react-vs-tilda → /services/nextjs/
- skilky-koshtuye-sajt → /services/nextjs/, /services/landing/ (ціни-посилання в таблиці)
- yak-obrati-rozrobnyka → /services/ai/

### Виправлення
- Logo href="#" → "/" на головній сторінці

### Документація
- `doc/SEO.md` — 3-місячний SEO-план (6 спринтів, контент-календар, KPI)
- `doc/seed-keywords-intent-map.md` — 110+ ключових фраз, intent map, content gap, quick wins

### Sitemap
- Додано 3 нових URL (/services/nextjs/, /services/landing/, /services/ai/) з priority 0.9
- Тепер 13 URL у sitemap

## 2026-04-08 — Sprint C: Accessibility + LCP optimization

### PageSpeed Insights аудит
- Перевірено 3 шаблони: homepage, blog (react-vs-tilda), case study (projects/ace)
- react-vs-tilda: Performance 93, Accessibility 79, LCP 2.6s
- projects/ace: Performance 75, Accessibility 81, LCP 5.1s (критично)

### Accessibility (14 сторінок)
- Додано skip-link `<a href="#main-content">Перейти до змісту</a>` з CSS (hidden → visible on focus)
- `<nav aria-label="Основна навігація">` на всіх сторінках
- `<main id="main-content">` обгортка контенту на всіх сторінках
- Контраст кольорів: `--ink-muted` `#7A7A7A` → `#6A6A6A` (WCAG AA pass)
- Таблиці: `<thead>`/`<tbody>`, `scope="col"`, порожні `<th>` замінено на "Критерій" (react-vs-tilda, skilky-koshtuye-sajt, jarvis-ai-assistant)
- `aria-label="Пов'язані статті"` на секціях related-posts
- `role="complementary" aria-label="Заклик до дії"` на CTA-банерах

### LCP / Performance (14 сторінок)
- Analytics скрипти (Clarity + GA4) перенесені з `<head>` в кінець `<body>` — прибирає блокування парсером
- Google Fonts preload розділено на 2 запити: DM Sans (критичний, body text) окремо від Instrument Serif + JetBrains Mono (secondary)
- Noscript fallback залишено як один комбінований запит
