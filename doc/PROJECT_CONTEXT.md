# Project Context

## Загальна інформація
- **Сайт:** parkinsandr.tech — портфоліо фрілансера веб-розробника
- **Тип:** Статичний HTML (без фреймворку/build system)
- **Деплой:** Vercel (автоматично через git push)
- **Remote:** `git@github.com:sashko1391/oleksandr-site.git` (SSH)

## Структура сайту (станом на 2026-04-05)

### HTML-сторінки (8)
- `/index.html` — головна (послуги, портфоліо, про мене, процес, відгуки, тарифи, блог, AI-чат)
- `/projects/agentis/` — кейс AI Legal Tech платформи
- `/projects/ace/` — кейс освітньої платформи
- `/projects/slavutych/` — кейс ресторану
- `/blog/yak-obrati-rozrobnyka/` — гайд: як обрати розробника
- `/blog/react-vs-tilda/` — порівняння React vs Tilda
- `/blog/skilky-koshtuye-sajt/` — гайд: скільки коштує сайт
- `/blog/devlog-business-empire-idle/` — девлог розробки idle-гри
- `/404.html` — кастомна сторінка помилки

### SEO-файли
- `/robots.txt` — дозволяє всіх ботів, вказує на sitemap
- `/sitemap.xml` — 8 URL з lastmod датами
- `/favicon.svg` — SVG favicon з ініціалами "OK"

### API
- `/api/send-chat.js` — Vercel serverless function → Telegram Bot API

### Зображення
- Всі в WebP форматі (`/images/*.webp`)
- `preview.jpg` — OG preview (залишений як JPG для сумісності)
- `empire-idle.webp` — скріншот гри для devlog

## Тарифи
- Стартовий: 20 000 ₴ (лендінг, 1-3 сторінки, 1 тиждень)
- Оптимальний: 30 000 ₴ (бізнес-сайт, 5-10 сторінок, CMS, 2-3 тижні)
- Максимальний: 40 000 ₴ (складний проєкт, AI, e-commerce, 3-5 тижнів)

## Бренд-кольори
- `#1B3A5C` — blue-deep (primary)
- `#5BA4D9` — blue-sky (accent)
- `#F5F0EA` — milk (background)

## Структура сайту (оновлено 2026-04-06)

### HTML-сторінки (11)
- `/index.html` — головна
- `/projects/agentis/` — кейс AGENTIS (Legal Tech)
- `/projects/ace/` — кейс Академії сучасних освітян
- `/projects/slavutych/` — кейс ресторану
- `/projects/atlas/` — кейс e-commerce (smoking accessories)
- `/blog/yak-obrati-rozrobnyka/` — гайд: як обрати розробника
- `/blog/react-vs-tilda/` — порівняння React vs Tilda
- `/blog/skilky-koshtuye-sajt/` — гайд: скільки коштує сайт
- `/blog/devlog-business-empire-idle/` — девлог idle-гри (SvelteKit)
- `/blog/devlog-empire-online/` — девлог MMO-гри (Next.js + Supabase)
- `/404.html` — кастомна сторінка помилки

### Аналітика
- **GA4:** G-Y891WWYE79 — підключено на всі 11 сторінок
- **GSC:** зареєстровано (вручну користувачем)

### Зображення (WebP)
- `ace.webp`, `agentis.webp`, `slavutych.webp`, `svengo.webp`, `interrogator.webp`, `parfumerka.webp` — портфоліо
- `atlas.webp` — скріншот e-commerce кейсу
- `empire-idle.webp` — скріншот idle-гри
- `empire-online.webp` — скріншот MMO-гри
- `preview.jpg` — OG fallback (залишений як JPG)

## Сервісні сторінки (додано 2026-04-06)
- `/services/nextjs/` — Розробка сайтів на Next.js (Service + BreadcrumbList + FAQPage JSON-LD)
- `/services/landing/` — Лендінг під рекламу (Service + BreadcrumbList + FAQPage JSON-LD)
- `/services/ai/` — AI-інтеграції для сайту (Service + BreadcrumbList + FAQPage JSON-LD)

## Microsoft Clarity
- **ID:** w7i1iwx0ah — підключено на всі сторінки (перед GA4)

## SEO-інфраструктура (додано 2026-04-06)
- BreadcrumbList JSON-LD на всіх inner pages (blog + projects)
- Related posts секції у всіх 5 блог-статтях (по 3 перехресних посилання)
- Внутрішні посилання з блогу на сервісні сторінки
- Sitemap: 13 URL (3 services + 4 projects + 5 blog + homepage)

## SEO-документація
- `doc/SEO.md` — 3-місячний SEO-план (квітень–червень 2026, 6 спринтів)
- `doc/seed-keywords-intent-map.md` — 110+ ключових фраз, intent map, content gap
- `CLAUDE.md` — проєктний конфіг з SEO sprint-планом і конвенціями

## Accessibility & Performance (додано 2026-04-08)
- Skip-link на всіх 14 сторінках (keyboard navigation)
- Semantic landmarks: `<nav aria-label>`, `<main id="main-content">`, `role="complementary"` на CTA
- WCAG AA контраст: `--ink-muted` `#6A6A6A` (раніше `#7A7A7A`)
- Analytics (Clarity + GA4) — в кінці `<body>`, не в `<head>` (покращує FCP/LCP)
- Google Fonts preload split: DM Sans окремо від Instrument Serif + JetBrains Mono
- Таблиці мають `<thead>`/`<tbody>`, `scope="col"`, непорожні `<th>`

## PSI Baseline (2026-04-08, mobile, до оптимізації)
| Сторінка | Performance | Accessibility | LCP |
|----------|-------------|---------------|-----|
| react-vs-tilda | 93 | 79 | 2.6s |
| projects/ace | 75 | 81 | 5.1s |

## Шаблон блог-статті
Всі статті використовують однаковий шаблон:
- Фіксована nav з логотипом + "← На головну"
- `.article-header` з тегом, H1, meta (автор, дата, час читання)
- `.article-body` (max-width 720px) з h2/h3, callouts (blue/green/orange), таблиці
- `.cta-banner` з посиланням на AI-чат
- Footer
