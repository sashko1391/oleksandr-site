# oleksandr-site (parkinsandr.tech) — Project Rules

## Що це за проєкт (з 2026-09-18 — у процесі переробки)
Особистий сайт Олександра Кравченка — автора і розробника: щоденник, програмування, творчість (оповідання, музика,
кліпи), життя з хворобою Паркінсона. Розробка сайтів на замовлення — окремий комерційний хаб `/services/` (активний дохід).
Квітень–серпень 2026 сайт будувався як lead-generation сайт веб-розробника; переробку описано в `doc/PERSONAL_SITE_PLAN.md`.

- Static HTML без build step (перехід на Astro — фаза Ф6 плану); хостинг Vercel (`vercel.json`); деплой = `git push` у `main`.
- Домен parkinsandr.tech; мова uk; гео — Київська область.
- Аналітика: GA4 `G-Y891WWYE79`, Microsoft Clarity `w7i1iwx0ah`, Plausible (first-party проксі `/js/script.js` + `/api/event`).
- Vercel Functions: `api/comments.js`, `api/tg-webhook.js`, `api/cron/comments-retention.js` + `lib/` (Supabase через
  IPv4 transaction pooler, Upstash KV, Turnstile, Telegram). AI-чат і лід-форми → Cloudflare Worker
  `oleksandr-site.sashko1391.workers.dev` (код воркера не в репо). `/api/send-chat.js` видалено 2026-07-14.
- RSS: `public/feed.xml` (генерує `scripts/build-feed.mjs`). Тести: `npm test` (vitest).

## Поточні плани й статус
| Документ | Статус |
|---|---|
| `doc/PERSONAL_SITE_PLAN.md` | 🟢 головний план переробки, фази Ф0–Ф7 |
| `doc/SERVICES_HUB_PLAN.md` | 🟡 Ф1 — план v2 (після рев'ю Codex), чекає відповідей власника на відкриті питання |
| `doc/SUBSCRIPTION_PLAN.md` | ⏸ пауза: RSS у проді; Telegram-канал і Email — після нової IA |
| `doc/baseline/` | 🔒 gitignored: сирі метрики baseline Ф0 |

Фази: Ф0 ✅ baseline · Ф1 `/services/` · Ф2 хаби `/code/`, `/creative/`, `/parkinson/` + оновлений `/journal/` ·
Ф3 нова головна + меню · Ф4 підписка · Ф5 продаж контенту (⛔ заблоковано) · Ф6 Astro · Ф7 членство (за попитом).
Паралельно: 🔴 **індексація — пріоритет №1**.

## Незмінні правила переробки
1. **URL постів не переносимо.** Розділи — хаби поверх наявних URL; один пост = один self-canonical, але може бути
   в кількох добірках. Якщо колись переносити — лише 1:1 через 301/308.
2. **Комерційні сторінки не видаляємо** (`/services/*`, `/pricing/`, `/projects/*`, статті для замовників).
3. **`@id` сутностей стабільні:** Person — `https://www.parkinsandr.tech/pro-mene/#author`; ProfessionalService —
   `https://www.parkinsandr.tech/#business` (не змінюється, навіть коли вузол переїде на `/services/` у Ф3).
   `@id` клієнта `https://www.ladomyr.kiev.ua/#business` у кейсі Ладомир — не чіпати ніколи.
4. **Рубрика Паркінсон = «досвід пацієнта»** (рецензента-невролога немає): дисклеймер у видимій зоні, джерела,
   «перевірено: дата», журнал виправлень; завжди поза пейволом.
5. **Одна велика зміна за раз;** перевірки функціональні — обсяги трафіку замалі для статистичного контролю.
6. **Репо публічне:** у `doc/`, `CLAUDE.md`, комітах — жодних сирих метрик, фінансових, юридичних чи особистих
   деталей. Сирі дані — лише в gitignored `doc/baseline/`.
7. **Коміт/пуш — лише на явне «коміт»/«пуш».** Робочий цикл: план у `doc/*_PLAN.md` → рев'ю (gemini/glm/codex) →
   код + тести → рев'ю діфа → пуш.

## File Structure (2026-09)
```
public/
├── index.html            ← головна (поки комерційна; переробка у Ф3)
├── 404.html (noindex) · robots.txt · sitemap.xml (44 URL) · feed.xml (RSS)
├── journal/              ← «Поза кодом»: index (хронологічна стрічка + фільтр жанрів) + 16 постів
├── blog/{slug}/          ← 12 статей: 6 для замовників, devlog-и, AI/SEO-кейси
├── services/{slug}/      ← 5 лендингів: nextjs, landing, ai, redesign, kyiv
├── projects/{slug}/      ← 6 кейсів
├── pricing/ · pro-mene/ (author page) · privacy/
├── js/comments.v1.js · fonts/ (self-hosted woff2) · images/ (WebP + JPG)
api/ · lib/ · scripts/ · tests/ · doc/
```
Індексів `/services/`, `/projects/`, `/blog/` поки немає (`/services/` — у Ф1).

## Scripts
- `node scripts/build-feed.mjs` — регенерує `public/feed.xml`
- `node scripts/inject-rss.mjs` — RSS `<link>` у `<head>` (ідемпотентно)
- `node scripts/inject-comments.mjs` — блок коментарів у journal + blog (ідемпотентно)
- `scripts/indexnow.sh [paths]` — IndexNow (Bing/Yandex)
- `scripts/patreon-login.mjs`, `scripts/patreon-fetch.mjs <url>` — імпорт постів із Patreon (Playwright + системний Chrome)
- `deploy.sh`, `update.sh` — legacy (копіювання з ~/Downloads); фактичний деплой = git push

## Чек-лист нового поста
1. Клон наявного поста того ж розділу (inline CSS, шрифти, аналітика). Title < 60, description < 155, canonical, OG/Twitter.
2. JSON-LD: Article (author → `/pro-mene/#author`) + BreadcrumbList; FAQPage — лише для реального видимого FAQ.
3. Коментарі: блок перед `</article>` (`inject-comments.mjs`) **+ `INSERT INTO posts(slug)` у Supabase** — інакше API 404.
4. `sitemap.xml` (lastmod), `node scripts/build-feed.mjs && node scripts/inject-rss.mjs`, картка в індексі розділу.
5. Щонайменше 3 вхідні внутрішні посилання; після деплою — IndexNow + GSC «Запросити індексування».

## Conventions
- HTML: `public/{section}/{slug}/index.html`; зображення: `public/images/` WebP (основний) + JPG (fallback), описовий `alt`.
- JSON-LD inline у `<script type="application/ld+json">`. Контент українською, код і конфіги англійською.
- Title < 60 символів, патерн «{Тема} | Олександр Кравченко»; meta description < 155, ключ на початку.
- Шрифти self-hosted: Playfair Display (заголовки), Manrope (текст), JetBrains Mono (теги) — усі з кирилицею, inline
  `@font-face`, `font-display: swap`. **НЕ додавати `<link rel="preload" as="font">`** — експеримент 2026-06-14
  погіршив FCP/LCP (сторінки text-LCP).
- Бренд-кольори: `#1B3A5C` (blue-deep), `#5BA4D9` (blue-sky), `#F5F0EA` (milk).

## Technical Notes
- CSS inline у `<style>`. Зовнішні скрипти: GA4, Clarity, Plausible (проксі), Turnstile (лише в коментарях), `/js/comments.v1.js`.
- `vercel.json`: rewrites Plausible; immutable-кеш `/fonts/*` і `/js/comments.v1.js`; headers `/feed.xml`; cron retention.
- Коментарі: `lib/db.js` — `prepare:false`, `ssl:'require'`, `max:1`; зміна env у Vercel потребує редеплою.
- Лаб-PSI цього сайту шумить (cold Vercel edge) — мірити 3–4 прогони, дивитись на медіану.

## Стан SEO (2026-09, якісно — цифри в gitignored baseline)
**Що добре:** унікальні title/description/canonical/OG на всіх сторінках; Article + BreadcrumbList з `@id`; robots.txt
пускає AI-ботів; sitemap повний (44/44); RSS; self-hosted шрифти; a11y (skip link, `<main>`, WCAG AA контраст);
аналітика внизу `<body>`.

**Що погано:**
- 🔴 **Індексація:** близько половини сторінок за 7 місяців без жодного показу — переважно журнал (усі пости про
  Паркінсон, проза) і 4 з 5 сервісних лендингів; непроіндексованих стає більше.
- Комерційні запити не вийшли в топ-30; органіку дають переважно особистий пост розробника (Джарвіс) і кейси
  за назвами клієнтів.
- Головна — єдиний комерційний хаб і ціль 28 CTA (`/#chat-section`) → перепривʼязка у Ф1, до зміни головної.

**Контентні пріоритети:** 1) індексація наявного; 2) хаби розділів; 3) особистий контент першої руки (Паркінсон,
проза, історії розробника); 4) `/services/` — переконливість для прямих відвідувачів, а не полювання на комерційні запити.

## Schema Architecture
| Тип сторінки | Обов'язково | Опційно |
|---|---|---|
| Головна (після Ф3) | Person, WebSite | — |
| Хаб розділу | CollectionPage, ItemList, BreadcrumbList | FAQPage |
| `/services/` | CollectionPage, ItemList(Service), BreadcrumbList, FAQPage | повний ProfessionalService — з Ф3 |
| Пост журналу / блогу | Article, BreadcrumbList | FAQPage (лише реальний FAQ) |
| Кейс | Article, BreadcrumbList | SoftwareApplication, LocalBusiness клієнта |
| Сервісний лендинг | Service, BreadcrumbList, FAQPage | HowTo |
| Паркінсон (YMYL) | Article + видимий дисклеймер, джерела, дата перевірки | — |

Правила: `@id` cross-references (правило 3); лише правдиві дані; `dateModified` — коли контент реально змінився;
Rich Results Test після змін schema; 4+ типів JSON-LD на ключових сторінках.

## V.A.L.I.D. Framework
| Pillar | Check |
|---|---|
| **V** — Verification (E-E-A-T) | Автор і credentials, реальні кейси, унікальні скріншоти, first-person дані |
| **A** — Accessibility & UX | CWV «Good» (LCP < 2.5s, INP < 200ms, CLS < 0.1), mobile-first, skip links |
| **L** — Logic & Structure | Schema з `@id`, ієрархія H1→H2→H3 |
| **I** — Intent Alignment | Контент відповідає наміру (комерційний → лендинг, інформаційний → гайд, особистий → пост) |
| **D** — Depth & Differentiation | Information Gain — унікальні дані й досвід, яких немає деінде |

## GEO (Generative Engine Optimization)
1. **Answer-first:** кожен H2 починається з 2 речень, що прямо відповідають на заголовок.
2. **Модульність:** таблиці, нумеровані списки, сітки — легко витягуються AI.
3. **Цитованість:** авторитетні джерела, конкретні числа, цитати з атрибуцією, точна термінологія.
4. **Entity-first:** повні назви сутностей у H1 і перших абзацах; без займенників у заголовках.
5. **Query fan-out:** покривати підпитання, а не один ключ.
6. **Expertise-to-Ad Ratio:** верхні 800px — > 35% оригінального змісту, а не CTA.

## Метрики
- Класичні (GSC + GA4): кліки/покази/CTR по сторінках; **індексація (Coverage) і к-сть URL з ≥ 1 показом**; CWV;
  події GA4 (`generate_lead`, `contact_click`, `chat_start`, `cta_click`).
- AI-ера: Share of Model (згадки бренду в ChatGPT/Perplexity/Claude/Gemini), AI Citation Frequency, реферали з AI.

## 2026 SEO/GEO/CWV Policy Sync
> Джерело правди: `~/Dashboard/knowledge/` (глобальна політика — `~/.claude/CLAUDE.md`). Пересинхронізувати, коли
> `~/Dashboard/knowledge/_refresh-manifest.json` показує новіший `last_refresh`.
- **«Getting Cited» замість «Ranking»:** AI читає верх сторінки й H2-блоки → answer-first абзаци, чіткі H2/списки;
  E-E-A-T author-блоки — «нові беклінки» для вибору джерел.
- **AI Mode:** inline-цитати всередині AI-тексту → короткі цитатопридатні речення з фактами; клікабельні title/OG-title.
- **Core Updates 2026:** придушення масового AI-контенту; пріоритет — унікальні дані, кейси, first-hand сигнали.
- **AI Overviews:** на ~48% запитів; падіння CTR 34–61% (після відскоку, не катастрофічні −65%) — AIO і не-AIO міряти
  окремо; дивитись на downstream (підписка, повернення), а не лише CTR.
- **Кластери:** adaptive depth > symmetric; менше, але глибше; кожна сторінка кластера лінкує на хаб + 2–3 сусідні.
- **Schema:** Article, FAQPage, HowTo, BreadcrumbList, ProfessionalService/LocalBusiness; Quiz/Practice Problems — deprecated.
- **CWV:** LCP < 2.5s · INP < 200ms (усі взаємодії) · CLS < 0.1; JS ≤ 300–400 KB gzipped/route; `fetchpriority="high"`
  на LCP-зображенні.
- **YMYL (Паркінсон):** порядок trust-сигналів — джерела → видимий дисклеймер → прозорість методології → зовнішні
  авторитетні джерела → кейси; «не замінює лікаря».

## Документація (`doc/`)
| Файли | Статус |
|---|---|
| `PERSONAL_SITE_PLAN.md`, `SERVICES_HUB_PLAN.md`, `SUBSCRIPTION_PLAN.md` | див. «Поточні плани й статус» |
| `DEVELOPMENT_LOG.md`, `PROJECT_CONTEXT.md` | журнали (лише дописувати) |
| `COMMENTS_PLAN.md`, `AUDIT_FIXES_PLAN.md`, `AUTHOR_PAGE_PLAN.md`, `GETTING_CITED_ARTICLE_PLAN.md`, `TEPLIY_DVIR_CASE_PLAN.md`, `QUICKFIXES_PLAN.md`, `HOMEPAGE_B_PLAN.md`, `reviews/hub-spoke-changes.md` | ✅ виконані (історія) |
| `SEO.md`, `PARKINSANDR_TECH_12_WEEK_ACTION_PLAN.md`, `SEED_KEYWORDS.md`, `seed-keywords-intent-map.md` | 🗄 історичні: комерційна SEO-стратегія квітня 2026, замінена переробкою |
| `leads.csv` | шаблон обліку заявок |
| `baseline/`, `research/`, `prompts/`, `overviews/`, частина `abaic_council/` | gitignored робочі матеріали |

## Reference
- `~/Dashboard/knowledge/` — джерело правди для SEO/GEO/coding/marketing політик
- `~/Dashboard/prompts/coding_standards.md`, `coding_specs.md` (PAGE_STANDARD_2026), `seo_standard.md`
- `~/.claude/doc/Audit.md` — аудит-промпти (quick/full/pre-release)
