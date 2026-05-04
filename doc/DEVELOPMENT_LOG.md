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

### PSI після оптимізації
- projects/ace: Performance 75→90, Accessibility 81→91, LCP 5.1s→2.9s

### Article schema audit
- Оновлено dateModified на 2 blog posts: devlog-business-empire-idle (04-05→04-08), devlog-empire-online (04-06→04-08)
- Всі 6 blog + 4 project pages мають коректний Article JSON-LD з @id автора

### AGENTIS case study — оновлення контенту
- Нова секція "Що нового: від MVP до платформи" (редизайн, генерація документів, монетизація, SEO, плани)
- Цифри оновлені: 207→300+ законів, 22k→144k+ семантичних блоків, додано "2 модулі"
- Tech stack: Vercel → Railway + Supabase + Plata by Mono
- Новий скріншот `agentis-v2.webp` (темна тема, новий UI)
- OG/Twitter image оновлені на agentis-v2.webp
- Meta description переписано під оновлені дані
- Скріншот на homepage portfolio grid також оновлено

### GA4 Conversion Tracking (14 сторінок)
- Homepage: 5 event types — `generate_lead` (контакт в чаті), `chat_start`, `chat_message`, `cta_click`, `contact_click`
- 13 inner pages: `cta_click`, `contact_click` (Telegram/WhatsApp/Email)
- Делеговане відстеження через `document.addEventListener('click')` — один скрипт на всі сторінки
- Tracking перевірено через GA4 Realtime — всі події приходять коректно

### Google Ads
- Створено обліковий запис Google Ads (sashko1391@gmail.com)
- Підготовлено структуру 3 кампаній: Next.js розробка, Лендінги, AI-інтеграції
- Ключові слова, оголошення, мінус-слова — задокументовані в розмові

## 2026-04-09 — CRO overhaul service pages + Google Ads launch

### /services/landing/ — CRO overhaul
- Hero переписано під ROI: "знижує вартість заявки і окупає рекламу"
- Додано lead form (ім'я + телефон + опис) → Telegram webhook + GA4 `generate_lead`
- 3 відгуки клієнтів (Славутич, ACE, Atlas) з іменами та нішами
- Блок гарантії "доопрацьовую безкоштовно до результату"
- Результати в punch-картках (PageSpeed 95, 8700+, 4 дні)
- 2 inline CTA (помаранчеві) після ключових блоків
- Контактна секція: форма + Telegram/WhatsApp/Email
- Всі CTA → #contact на цій же сторінці (не на головну)
- ABAIC council review (4 моделі) → doc/abaic_council/

### /services/nextjs/ — CRO overhaul
- Hero: "Сайт, який приводить клієнтів через SEO і рекламу" (без Next.js у заголовку)
- Перший блок: "Коли сайт не приносить клієнтів" (біль) замість "Коли потрібен Next.js" (технологія)
- Features перефразовані під ROI: "Швидкість → дешевший трафік", "SEO → безкоштовний трафік"
- Пакети з результатом: "Для запуску реклами", "Для SEO і масштабування"
- Lead form, відгуки, гарантія, inline CTA — аналогічно landing

### /services/ai/ — CRO overhaul
- Hero: "AI-асистент, який обробляє заявки і не втрачає клієнтів"
- Перший блок: біль ("клієнт пише о 22:00, ніхто не відповідає")
- AGENTIS кейс: "2 год → 5 хв" як головна метрика, 300+ законів
- CTA під результат: "Скільки заявок можна автоматизувати?"
- Lead form, відгуки, гарантія, inline CTA

### Google Ads — перша кампанія "Лендінги"
- Кампанія створена та опублікована (9 квітня 2026)
- Тип: Search only (без медійної мережі та партнерів)
- 11 ключових слів (exact + phrase match): замовити лендінг, лендінг під ключ тощо
- 15 заголовків + 4 описи (Responsive Search Ad), якість 89.1%
- 4 sitelinks (портфоліо, вартість, AI, Next.js)
- Бюджет: 300 грн/день
- Bidding: Maximize Conversions
- Локація: Україна, мови: uk + ru
- Статус: чекає поповнення балансу

### ABAIC команда оновлена
- Gemini: модель gemini-2.5-flash (оновлено)
- Grok: grok-3-mini-fast (підтверджено)
- GPT-4o-mini: працює після поповнення
- Claude Haiku 4.5: підтверджено
- Всі 4 моделі протестовані — працюють

### /upd глобальна команда
- Виконано повний upd: doc files, FULL_SOURCE.txt (9380 рядків), CLAUDE.md, jarvis.md, MEMORY.md

## 2026-04-11 — Sprint C closure: Lighthouse audit + PSI verification

### Lighthouse CLI
- Встановлено Lighthouse 13.1.0 глобально через npm (user prefix `~/.npm-global`)
- Потрібен Node 22+ (nvm use v22.22.2) — Node 18 не підтримує `import ... with { type: 'json' }`
- PSI API квота вичерпана — використано локальний Lighthouse CLI як альтернативу

### PSI результати після LCP-оптимізацій (mobile, Lighthouse CLI)
| Сторінка | Perf | A11y | SEO | LCP | CLS | TBT |
|----------|------|------|-----|-----|-----|-----|
| Homepage | 97 | 96 | 100 | 1.3s | 0.004 | 180ms |
| blog/react-vs-tilda | 100 | 91 | 100 | 1.1s | 0.004 | 40ms |
| projects/ace | 100 | 91 | 100 | 1.0s | 0.007 | 50ms |

### Порівняння до/після (Sprint C оптимізації)
| Сторінка | Perf | LCP |
|----------|------|-----|
| react-vs-tilda | 93 → 100 | 2.6s → 1.1s |
| projects/ace | 75 → 100 | 5.1s → 1.0s |

### Best Practices (77 на всіх сторінках)
- Причина: Microsoft Clarity ставить third-party cookies (CLID, SM, MUID через clarity.ms + bing.com)
- DevTools Issues — ті самі cookies Clarity
- Рішення: залишити як є — Clarity потрібен для heatmaps, Best Practices score не впливає на SEO ranking

### Sprint C — закритий ✅
- Credit links — вже є на сайтах клієнтів
- PSI re-run — підтверджено покращення, всі CWV у зеленій зоні

## 2026-04-12/13 — Google Ads: conversion tracking setup

### Google Ads ↔ GA4 зв'язок
- Змінено URL сайту в Google Ads з `sashko1391.substack.com` → `www.parkinsandr.tech`
- Підключено GA4 ресурс Parkinsandr (531391243) як джерело конверсій
- Знято "Конверсії телефонних викликів" (не використовуються)

### Конверсії імпортовані з GA4
- `generate_lead` — категорія "Надсилання форми для лідів" (primary)
- `contact_click` — додаткова конверсія

### Стан кампанії "Лендінги"
- Оголошення на модерації (1 з 1 розглядається)
- Всі чеклісти зелені: ✅ Оголошення, ✅ Цілі, ✅ Обліковий запис
- Попередження "відстеження конверсій не завершено" — нормально, буде працювати після перших кліків
- Очікується: модерація 24-48 год + поповнення рахунку

## 2026-04-22 — GSC indexing + Google Ads review escalation

### GSC indexing push
Запрошено індексацію 6 URL через URL Inspection:
- /services/landing/, /services/nextjs/
- /blog/skilky-koshtuye-sajt/
- /projects/atlas/
- /blog/devlog-business-empire-idle/, /blog/devlog-empire-online/

### Google Ads review — stuck
- Customer ID: **697-221-7708**
- Кампанія "Parkinsandr" — статус "Заплановано" з 2026-04-09, оголошення досі Under Review
- 2026-04-16: support (Puneet) переслав запит команді з ETA 2-3 робочих дні (case 4-6482000040785)
- 2026-04-22: минуло 4 робочих дні → відправлено follow-up email з ескалацією

### Conversion tracking — finalized
Перевірено повний flow у Goals → Summary → "Надсилання форм для лідів":
- 3 дії-конверсії як Primary, всі з GA4:
  - `contact_click` (Parkinsandr web)
  - `SUBMIT_LEAD_FORM`
  - `generate_lead` (Подія GA4)
- GA4 ↔ Ads зв'язано ще 2026-04-12 (персоналізована реклама увімкнена)
- **Додано Parkinsandr до "Оптимізація на рівні кампанії"** для цілі "Надсилання форм для лідів" → кампанія тепер оптимізується під заявки, а не під залучення (кліки)

### UI gotchas (зафіксовано)
- Сповіщення "Оновлено умови використання" — passive acceptance, кнопки "Прийняти" немає навмисно, ігнорувати
- Сповіщення "Укажіть номер телефону" — маркетинг від Google sales, не блокер
- Діагностика "звіти про конверсії не створюються" — нормальна для нової кампанії без показів, зникне після першої заявки
- Wizard "Рекомендації → Завершіть налаштування відстеження конверсій" пропонує створити дубль gtag-конверсії з e-commerce опціями — ігнорувати, у нас вже GA4-імпорт
- billing.google.com/paymentsinfofinder — інформаційна сторінка без дій, не туди для ToS

---

## 2026-04-29 — /projects/juliaart/ кейс сайту-портфоліо для художниці

### Що зроблено
Створено п'ятий case study на сайті — `/projects/juliaart/` для проєкту Julia Satyr Art (satyr.com.ua), сайт-візитка української художниці олійного живопису. Це перший кейс у портфоліо, який не Next.js / e-commerce / AI, а навмисно мінімалістичний static HTML — щоб показати, що під різні задачі рекомендується різний стек.

### Контент-структура (за шаблоном Atlas)
- Hero з тегом «Кейс: Сайт-портфоліо», h1 з italic-акцентом
- 4 stat-боки: 15 робіт · 5 JSON-LD · ~2.5MB · 4000₴ бюджет
- Розділи: Задача → Рішення → SEO та AI-видимість → Перформанс → Бренд як деталі (5-step pipeline) → Технічний стек → Чому не Tilda/Webflow
- 6 feature cards: masonry-галерея, lightbox, hamburger overlay, authentic підпис, canvas texture, WCAG AA
- Внутрішнє посилання на `/projects/atlas/` як контраст («коли потрібен фреймворк»)
- Зовнішнє live-посилання на satyr.com.ua (visit-link button + 5 inline посилань у тексті)

### Бренд-палітра (інша за всі попередні кейси)
Cream/sand замість золотого Atlas / синього AGENTIS:
- `--bg-dark: #1c1b18`, `--bg-card: #26241f`
- `--text-main: #f3ede4`, `--text-muted: #9e978c`
- `--accent: #d9c8b8`, `--accent-hover: #efe5d8`
- `--border-color: rgba(217, 200, 184, 0.18)`

### Schema
- Article (`@type`) з referenced `author: {"@id": "https://www.parkinsandr.tech/#author"}` — Person визначається на homepage, тут лише посилання
- BreadcrumbList: Головна → Портфоліо → Julia Satyr Art

### Зображення
- `public/images/juliaart.jpg` (74 KB) — копія OG-картинки satyr.com.ua (1200×630)
- `public/images/juliaart.webp` (36 KB) — конвертовано через PIL (`Image.save WEBP quality=85`), бо `cwebp` не встановлений

### Інтеграції з рештою сайту
- Картка у `public/index.html` після Atlas, з reveal-d2 анімацією, теги «Портфоліо · Мистецтво», метрики `HTML · CSS · JS` / `5 schema-блоків` / `satyr.com.ua`
- `public/sitemap.xml` — додано URL з lastmod 2026-04-29, priority 0.8
- Alt-тексти описові («Julia Satyr Art — сайт-портфоліо української художниці олійного живопису»)

### Commit
`33dee6b feat: /projects/juliaart/ — кейс сайту-портфоліо для художниці Julia Satyr` (5 files, 428 insertions). Запушено на main → Vercel автодеплой.

### Lessons / нюанси для наступних кейсів-портфоліо
- Шаблон Atlas універсальний для будь-якого кейсу: hero → stats → callout → задача → рішення → feature-grid → pipeline → tech stack → comparison → result callout
- Палітру варто адаптувати під реальний бренд проєкту, а не повторювати золотий Atlas — інакше всі кейси злипаються візуально
- `visit-link` button (зовнішнє посилання на live-сайт) краще ставити одразу після hero-зображення, не у footer — це primary CTA для відвідувача кейсу
- «Чому не Tilda/Webflow» розділ — корисний для clients, які приходять з установкою «візьму конструктор». Чесне порівняння цін у місяць.

## 2026-04-30 — /pricing/ smoke-test + GA4 events verification

### Що зроблено
- Проведено end-to-end smoke-test сторінки `/pricing/` (utility-сторінка з 6 пакетами + брифом)
- Підтверджено реєстрацію всіх 6 кастомних GA4 events у звіті "Події":
  - `pricing_view` (page load)
  - `pricing_view_tier` (картка 50% у viewport, IntersectionObserver)
  - `pricing_select_tier` (CTA «Обговорити такий сайт» → autofill site_type у формі)
  - `pricing_compare_view` (comparison-таблиця у viewport)
  - `pricing_form_submit_attempt` (натискання submit)
  - `pricing_form_submit` (успішний webhook → Telegram)
- Telegram-нотифікація з форми приходить ✅
- Позначено як conversions (⭐): `pricing_form_submit`, `pricing_select_tier`
- `generate_lead` — вже була позначена раніше

### Висновки
- /pricing/ повністю робочий: events → GA4 + форма → Telegram webhook
- Реалістичний smoke-test через Realtime + 28-day report показав, що JS-tracking, IntersectionObserver-based view events і form submission flow працюють як заплановано
- Можна закривати таску /pricing/ і переходити до Sprint C (CWV + cluster expansion)
