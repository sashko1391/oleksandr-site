# AGENTS.md — parkinsandr.tech

> Спільні правила проєкту для всіх AI-агентів (Claude Code, Codex тощо) — **source of truth**.
> `CLAUDE.md` лише імпортує цей файл і додає Claude-специфічне. Змінювати обидва — одним комітом.
> Позначки правил: `[enforced: <механізм>]` — порушення ловить тест/скрипт; `[advisory]` — перевіряється людиною/рев'ю.

## Проєкт
Особистий сайт Олександра Кравченка — автора і розробника: щоденник, програмування, творчість (оповідання, музика,
кліпи), життя з хворобою Паркінсона. Розробка сайтів на замовлення — окремий комерційний хаб `/services/`.
З 2026-09-18 сайт переробляється з lead-generation сайту веб-розробника в особистий — `doc/PERSONAL_SITE_PLAN.md`.

- Static HTML без build step (Astro — фаза Ф6); хостинг Vercel (`vercel.json`); деплой = `git push` у `main`.
- Домен parkinsandr.tech; мова контенту — українська, код і конфіги — англійська; гео — Київська область.
- Аналітика: GA4 `G-Y891WWYE79`, Microsoft Clarity `w7i1iwx0ah`, Plausible (first-party проксі `/js/script.js` + `/api/event`).
- Підписка: RSS (загальний + по розділах), публічний Telegram-канал `@parkinsandr` (`t.me/parkinsandr`,
  URL — константа `TELEGRAM_CHANNEL` у `scripts/link-policy.mjs`) і email через Resend
  (домен `send.parkinsandr.tech`, подвійне підтвердження, таблиця `subscribers`; форма — на 4 хабах).
- Vercel Functions: `api/comments.js`, `api/subscribe.js`, `api/subscribe/confirm.js`, `api/unsubscribe.js`,
  `api/tg-webhook.js`, `api/cron/{comments,subscribers}-retention.js` + `lib/` (Supabase через
  IPv4 transaction pooler, Upstash KV, Turnstile, Telegram). Чат на `/services/` (до Ф3 — на головній) — **скриптовий бот** (готові відповіді
  в JS, без LLM); заявки з бота й лід-форм пересилає в Telegram Cloudflare Worker `oleksandr-site.sashko1391.workers.dev`
  (код воркера не в репо).
- RSS: `scripts/build-feed.mjs` генерує загальносайтовий `public/feed.xml` і фіди розділів
  (`/parkinson/`, `/code/`, `/creative/`, `/journal/` — розділ із `HUB_MEMBERS`, до 30 найновіших у кожному).
  Тести: `npm test` (vitest).

## Плани й статус
| Документ | Статус |
|---|---|
| `doc/PERSONAL_SITE_PLAN.md` | 🟢 головний план переробки, фази Ф0–Ф7 |
| `doc/SERVICES_HUB_PLAN.md` | ✅ Ф1 виконано, у проді з 2026-09-19 (`/services/` із формою, перепривʼязка; фаза `f1-done`) |
| `doc/CONSISTENCY_PLAN.md` | ✅ Ф1.5 виконано 2026-09-20: чесні форми, одна модель цін, відгуки, цифри з джерелами |
| `doc/HUBS_PLAN.md` | ✅ Ф2 виконано 2026-09-21: хаби, архів `/blog/`, рамка рубрики, breadcrumbs → хаби (`f2-done`) |
| `doc/PARKINSON_EDITORIAL_POLICY.md` | ✅ затверджено 2026-09-21; текст у проді — `/parkinson/redaktsiina-polityka/` |
| `doc/PARKINSON_CLAIM_AUDIT.md` | ✅ аудит «твердження → джерело» 5 постів рубрики (Ф2, крок 2a) |
| `doc/SUBSCRIPTION_PLAN.md` | ✅ Ф4 виконано 2026-09-21: RSS по розділах, Telegram-канал, email із розсилкою |
| `doc/INDEXING_PLAN.md` | 🟢 трек «Індексація»: дані GSC, зроблене 2026-09-21, що міряти далі |
| `doc/baseline/` | 🔒 gitignored: сирі метрики baseline Ф0 |

Фази: Ф0 ✅ baseline · Ф1 ✅ `/services/` · Ф1.5 ✅ чесні форми й факти · Ф2 ✅ хаби `/code/`, `/creative/`,
`/parkinson/`, архів `/blog/`, рамка рубрики й breadcrumbs на хаби ·
Ф3 ✅ особиста головна + наскрізне меню · Ф4 ✅ підписка: RSS по розділах, Telegram-канал, email із розсилкою
(увесь ланцюжок перевірено живим прогоном 2026-09-21) · Ф5 продаж контенту (⛔ заблоковано) · Ф6 Astro ·
Ф7 членство (за попитом).
Паралельно: 🔴 **індексація — пріоритет №1**. Перед роботою над фазою — звір її статус у плані.

## Правила
1. **URL постів не переносимо.** Розділи — хаби поверх наявних URL; один пост = один self-canonical, може бути в кількох
   добірках. Перенесення — лише 1:1 через 301/308. `[advisory; биті внутрішні посилання ловить tests/links.test.js]`
2. **Комерційні сторінки не видаляємо** (`/services/*`, `/pricing/`, `/projects/*`, статті для замовників). `[advisory]`
3. **`@id` сутностей стабільні:** Person — `https://www.parkinsandr.tech/pro-mene/#author` (старий `/#author` заборонено);
   ProfessionalService — `https://www.parkinsandr.tech/#business` (не змінюється, навіть коли вузол переїде на `/services/`);
   `@id` клієнта `https://www.ladomyr.kiev.ua/#business` у кейсі Ладомир — не чіпати. Пошук/заміна в JSON-LD — лише за
   повним URL, не за суфіксом. `[enforced: tests/policy.test.js]`
4. **Не додавати `<link rel="preload" as="font">`** — на цьому сайті погіршує FCP/LCP (експеримент 2026-06-14).
   `[enforced: tests/policy.test.js]`
5. **Sitemap = рівно всі indexable сторінки; кожна HTML-сторінка, крім `404.html`, має рівно один
   rss-`alternate` на `/feed.xml` у `<head>`.** Сторінка розділу (хаб або пост, чий `primary`-хаб має фід)
   додає другий `alternate` — на фід свого розділу, і ставить його **першим**: клієнт, що розуміє лише один
   фід, має підписатися на тематичний. Склад визначає `tagsFor()` у `scripts/inject-rss.mjs`.
   `[enforced: tests/policy.test.js, tests/feed.test.js]`
6. **Фіди відповідають постам:** кожен фід — до 30 найновіших постів свого розділу (`MAX_ITEMS`),
   розділ береться з `HUB_MEMBERS`, загальний `/feed.xml` — з усіх постів. Після нового поста регенерувати;
   тест звіряє записані файли з тим, що згенерував би скрипт зараз. `[enforced: tests/feed.test.js]`
7. **Рубрика Паркінсон = «досвід пацієнта»** (рецензента-невролога немає): дисклеймер у видимій зоні, джерела,
   «перевірено: дата», журнал виправлень; завжди поза пейволом; без обіцянок лікування. `[advisory]`
8. **Одна велика зміна за раз;** перевірки після змін — функціональні (обсяги трафіку замалі для статистики). `[advisory]`
9. **Репо публічне:** у репо, комітах і PR — жодних сирих метрик, фінансових, юридичних чи особистих деталей; сирі
   дані — лише в gitignored `doc/baseline/`. `[advisory — перевір diff перед комітом]`
10. **Коміт і push — лише на явне прохання власника** («коміт» / «пуш»). `[advisory]`
11. **Бекенд коментарів і скрипти змінюються разом із тестами;** `npm test` зелений до коміту.
    `[enforced: npm test — 26 файлів, 463 тести: handlers, security, schema, feed, email, policy, links,
    internal-links, lead-forms, prices, testimonials, claims, faq-schema, images, hubs, nav, homepage,
    parkinson-frame, parkinson-claims, services-page, journal-index, repoint-anchors, announce, announce-email,
    subscribe, subscribe-ui]`
12. **Внутрішні посилання цілісні:** кожне same-origin посилання — `href`/`src`/`srcset`/`poster`/`xlink:href`, CSS
    `url()` у `<style>` і `style=""`, абсолютний `<meta content>` (`og:image`), URL у JSON-LD (крім `@id` сутностей;
    `item.@id` breadcrumbs — посилання) — веде на наявний файл у канонічній формі (www, https, зі слешем, без зайвого
    percent-encoding), фрагмент — на наявний `id` HTML-сторінки (зовнішні SVG-спрайти не підтримуються). URL-властивості
    JSON-LD — лише абсолютні; `id` на сторінці унікальні; `<base>` заборонено; кожна indexable сторінка має рівно один
    canonical = її URL. Політика фази (`scripts/link-policy.mjs`, `CURRENT_PHASE`; маніфест хабів Ф2 — `HUB_MEMBERS`): дозволені якорі головної, маніфест
    CTA, посилань на хаб і «напишіть мені» (за текстом посилання), breadcrumbs position 2, точна к-сть `@id #business`; покриття,
    повноту й цілі маніфесту тести перевіряють незалежно від нього; фазу перемикає коміт, що виконує міграцію.
    Не покрито: `<form action>` (API-маршрути — не файли). `[enforced: tests/links.test.js]`
13. **Підписка на email — згода й чесність:** лист розсилки завжди має видиме посилання на відписку
    і заголовки `List-Unsubscribe` + `List-Unsubscribe-Post` (one-click RFC 8058); доставка рахується
    по кожному отримувачу (`announcement_deliveries`), а не по посту, і повтор прогону не шле другий лист. подвійне підтвердження (GET лише показує кнопку, підтверджує
    тільки POST — інакше поштовий сканер «підтверджує» за людину); токени в БД лише як sha256; токен відписки
    ніколи не обнуляється; `/api/unsubscribe` свідомо БЕЗ same-origin-перевірки (one-click RFC 8058 приходить
    без `Origin`; авторизує сам токен); відповідь `/api/subscribe` однакова для нової й уже підписаної адреси,
    але ніколи не обіцяє листа, якого не надіслали (відмова Resend → 503). Ліміти на адресу — і в KV, і в БД.
    `[enforced: tests/subscribe.test.js, tests/subscribe-ui.test.js]`
14. **Правдивість:** сайт не видає скриптового бота за AI чи людину, власний продукт — за клієнта; без анонімних
    чи неперевірених відгуків; кожна цифра на комерційних сторінках — із кейсу або `/pricing/` (розбіжності між
    сторінками не множити, а виправляти в джерелі). Джерело правди для цін — `/pricing/` (модель B, рішення
    власника 2026-09-20): ціна кожної категорії й термін лендингу 5–7 днів беруться звідти, включно з JSON-LD
    і meta description; ринкові цифри (не мої ціни) — лише з поіменованим винятком у тесті. Відгук — одне
    формулювання на всіх сторінках, автор названий.
    Кожен відсоток на комерційній сторінці — або з посиланням на дослідження в тому ж абзаці, або своє
    вимірювання зі сторінкою, де воно показане, або умова роботи з маніфесту `tests/claims.test.js`.
    FAQPage-схема дослівно повторює видимий FAQ; заявлені `width`/`height` = пропорція самого файлу.
    `[enforced: tests/prices.test.js, tests/testimonials.test.js, tests/claims.test.js, tests/faq-schema.test.js,
    tests/images.test.js; /services/ — tests/services-page.test.js]`

## Структура (2026-09)
```
public/
├── index.html            ← головна: особиста (Ф3) — інтро + свіжі пости 4 розділів + один блок про роботу
├── 404.html (noindex) · robots.txt · sitemap.xml (52 URL) · feed.xml (RSS усього сайту)
├── journal/              ← «Журнал»: index (стрічка всіх 18 постів + фільтр жанрів, посилання на хаби)
├── journal/{slug}/       ← 18 постів: есеї, оповідання, пісні, щоденник, подорожі, рубрика Паркінсон
├── parkinson/            ← хаб рубрики (Ф2) + `redaktsiina-polityka/` — редполітика рубрики
├── code/ · creative/     ← хаби «Код» і «Творчість» (Ф2)
├── blog/                 ← архів усіх статей (Ф2, не в меню)
├── blog/{slug}/          ← 12 статей: 6 для замовників, devlog-и, AI/SEO-кейси
├── services/             ← хаб `/services/` (Ф1: послуги, кейси, ціни, FAQ, форма `#contact`)
├── services/{slug}/      ← 5 лендингів: nextjs, landing, ai, redesign, kyiv
├── projects/{slug}/      ← 6 кейсів
├── pricing/ · pro-mene/ (author page) · privacy/
├── {parkinson,code,creative,journal}/feed.xml ← фіди розділів (Ф4)
├── js/comments.v1.js · js/lead-form.v1.js · js/subscribe.v2.js · fonts/ (woff2) · images/ (WebP + JPG)
api/ (7 функцій) · lib/ (7 модулів) · scripts/ (12) · tests/ (26 файлів, 463 тести) · db/ (міграції) · doc/
```
Індексів `/projects/` і `/blog/` немає; кейси й статті для замовників зібрано на `/services/`.

## Скрипти
- `node scripts/build-feed.mjs` — регенерує `public/feed.xml` + фіди розділів `public/{parkinson,code,creative,journal}/feed.xml`
- `npm run announce -- <розділ/slug> [--dry] [--only=tg|feed|email] [--force] [--note "…"]` — публікація поста:
  фіди + пост у Telegram-канал (`@parkinsandr`) + лист підписникам розділу. Секрети — з gitignored `.env`
  (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, а для листів ще `DATABASE_URL`, `RESEND_API_KEY`,
  `EMAIL_HASH_SECRET`); стан Telegram — у gitignored `.announce-state.json`, стан листів — у таблиці
  `announcement_deliveries` по кожному отримувачу; невідомий прапорець зупиняє прогін; `--dry` нічого не шле
- `node scripts/inject-rss.mjs` — RSS `<link>` у `<head>`: загальний на всіх сторінках, крім 404; фід розділу —
  першим на хабі розділу та на його постах (ідемпотентно)
- `node scripts/inject-comments.mjs` — блок коментарів у journal + blog (ідемпотентно)
- `node scripts/inject-nav.mjs [--check]` — наскрізне меню на всіх сторінках (ідемпотентно; 404 не чіпає)
- `npm run check:links [-- --phase <name>]` — валідатор посилань (цілісність + політика фази, зараз `f2-done`);
  `--phase` — прогін іншої фази: показує, що ще треба перепривʼязати
- `node scripts/repoint-anchors.mjs [--phase f1|f2|f3] [--dry]` — міграції посилань: Ф1 (якорі головної),
  Ф2 (breadcrumbs → хаби), Ф3 (перейменування розділу в breadcrumbs) — усі виконані. План → перевірка
  (лічильники, семантичний diff JSON-LD, валідатор) → запис; якщо перевірка не пройшла, не пишеться нічого
  (сам запис файлів — послідовний, без відкату вже записаних). Ідемпотентні: повторний прогін — 0 змін
- `npm run smoke:forms [-- --screenshots <dir>]` — браузерний smoke всіх 7 лід-форм: успіх, відмова воркера,
  без JavaScript + специфіка `/services/` (Playwright + системний Chrome, воркер підмінено; не входить у `npm test`)
- `scripts/indexnow.sh [paths]` — IndexNow (Bing/Yandex)
- `scripts/patreon-login.mjs`, `scripts/patreon-fetch.mjs <url>` — імпорт постів із Patreon (Playwright + системний Chrome)
- `db/*.sql` — міграції Supabase (застосовані; файл лишається як джерело правди схеми)
- `deploy.sh`, `update.sh` — legacy (копіювання з ~/Downloads); фактичний деплой = git push

## Чек-лист нового поста
1. Клон наявного поста того ж розділу (inline CSS, шрифти, аналітика). Title < 60, description < 155, canonical, OG/Twitter.
2. JSON-LD: Article (author → `/pro-mene/#author`) + BreadcrumbList; FAQPage — лише для реального видимого FAQ.
3. Коментарі: блок перед `</article>` (`inject-comments.mjs`) **+ `INSERT INTO posts(slug)` у Supabase**, інакше API 404.
   `[advisory — перевір GET /api/comments?slug=… → 200]`
4. `sitemap.xml` (lastmod), пост у `HUB_MEMBERS` (`scripts/link-policy.mjs`) — інакше він не потрапить ні на хаб,
   ні у фід розділу, `node scripts/build-feed.mjs && node scripts/inject-rss.mjs`, картка в індексі розділу.
   Далі анонс: `npm run announce -- <розділ/slug> --dry` → перевірити текст → без `--dry`.
   `[enforced: tests/policy.test.js + tests/feed.test.js]`
5. Щонайменше 3 вхідні внутрішні посилання; після деплою — IndexNow + GSC «Запросити індексування». `[advisory]`

## Конвенції
- HTML: `public/{section}/{slug}/index.html`; зображення: `public/images/` WebP (основний) + JPG (fallback), описовий `alt`.
- JSON-LD inline у `<script type="application/ld+json">`; CSS inline у `<style>`.
- Title < 60 символів, патерн «{Тема} | Олександр Кравченко»; meta description < 155, ключ на початку.
- Шрифти self-hosted: Playfair Display (заголовки), Manrope (текст), JetBrains Mono (теги), усі з кирилицею, inline
  `@font-face`, `font-display: swap`.
- Бренд-кольори: `#1B3A5C` (blue-deep), `#5BA4D9` (blue-sky), `#F5F0EA` (milk).
- Коміти: `type(scope): summary`, один логічний change на коміт.

## Технічні нотатки
- Зовнішні скрипти: GA4, Clarity, Plausible (проксі), Turnstile (лише в коментарях), `/js/comments.v1.js`.
- `vercel.json`: `trailingSlash: true` + `cleanUrls: true` (неканонічні URL → 308 на форму зі слешем, без дублів
  для сканування). **Наслідок:** виклики API теж треба робити зі слешем (`/api/subscribe/`), інакше кожен
  запит коштує зайвий 308, а one-click POST від поштового клієнта може за ним і не піти. `comments.v1.js`
  досі ходить без слеша (працює через редирект); виправити — разом із наступним бампом до `v2`
  rewrites Plausible; immutable-кеш `/fonts/*`, `/js/*.v1.js`; headers `/feed.xml` і `/:section/feed.xml`;
  crons: очистка коментарів (3:00) і підписників (3:30).
- Коментарі: `lib/db.js` — `prepare:false`, `ssl:'require'`, `max:1`; `DATABASE_URL` — лише IPv4 transaction pooler;
  зміна env у Vercel потребує редеплою.
- Postgres (Supabase, ЄС): `posts`, `comments`, `subscribers`, `announcement_deliveries`; міграції — `db/*.sql`
  (застосовані, файли лишаються джерелом правди схеми). RLS увімкнено без політик: доступ лише через пулер,
  авторизація в коді функцій.
- **Зовнішні залежності можуть тихо померти.** 2026-09-21 виявилося, що безкоштовне сховище Upstash KV зникло —
  і форма коментарів не приймала коментарі **з 11 серпня**, бо лічильники недоступні → fail-closed 503. Перевіряти
  час від часу: `POST /api/comments/` і `POST /api/subscribe/` із завідомо невалідною капчею мають віддавати **400**;
  503 або зависання = KV чи база.
- **Зміна пароля бази або секрету — це два місця.** `DATABASE_URL` живе у Vercel env, і після зміни пароля в Supabase
  потрібен редеплой, інакше функції висять на підключенні (у логах статус 0 / 504). `EMAIL_HASH_SECRET` замінювати
  не можна безболісно: від нього залежать хеш адреси (suppression) і токени відписки у вже надісланих листах.
- Лаб-PSI цього сайту шумить (cold Vercel edge) — мірити 3–4 прогони, дивитись на медіану.

## Стан SEO (2026-09, якісно — цифри в gitignored baseline)
- **Добре:** унікальні title/description/canonical/OG; Article + BreadcrumbList з `@id`; robots.txt пускає AI-ботів;
  sitemap повний; RSS; self-hosted шрифти; a11y (skip link, `<main>`, WCAG AA); аналітика внизу `<body>`.
- 🔴 **Індексація:** значна частина сторінок за 7 місяців без жодного показу — переважно журнал (усі пости про
  Паркінсон, проза) і майже всі сервісні лендинги; цифри — у gitignored `doc/baseline/` (правило 9).
- Комерційні запити не вийшли в топ-30; органіку дають особистий пост розробника (Джарвіс) і кейси за назвами клієнтів.
- Комерційні CTA ведуть на форму `/services/#contact`, лендинги — на хаб `/services/`; «напишіть мені» в постах про
  Паркінсон — на особистий Telegram (Ф1, крок 3). Від Ф2 жодна сторінка не залежить від якорів головної:
  breadcrumbs ведуть на хаби (`f2-done`), тож переробка головної у Ф3 нічого не ламає.
- **Контентні пріоритети:** 1) індексація наявного; 2) хаби розділів; 3) особистий контент першої руки;
  4) `/services/` — переконливість для прямих відвідувачів, а не полювання на комерційні запити.

## Schema
| Тип сторінки | Обов'язково | Опційно |
|---|---|---|
| Головна | Person, WebSite, WebPage | — |
| Хаб розділу | CollectionPage, ItemList, BreadcrumbList | FAQPage |
| `/services/` | CollectionPage, ItemList(Service), BreadcrumbList, FAQPage, ProfessionalService (вузол тут із Ф3) | — |
| Пост журналу / блогу | Article, BreadcrumbList | FAQPage (лише реальний FAQ) |
| Пост про пісню чи кліп | Article + BreadcrumbList + MusicRecording або VideoObject | — |
| Кейс | Article, BreadcrumbList | SoftwareApplication, LocalBusiness клієнта |
| Сервісний лендинг | Service, BreadcrumbList, FAQPage | HowTo |
| Паркінсон (YMYL) | Article + видимий дисклеймер, джерела, дата перевірки | — |

Лише правдиві дані; `dateModified` — коли контент реально змінився; Rich Results Test після змін schema. `[advisory]`

## SEO/GEO-орієнтири `[advisory]`
- **V.A.L.I.D.:** Verification (автор, credentials, реальні кейси) · Accessibility (LCP < 2.5s, INP < 200ms, CLS < 0.1) ·
  Logic (schema з `@id`, H1→H2→H3) · Intent (тип сторінки = намір) · Depth (унікальні дані й досвід).
- **GEO:** answer-first (2 речення на початку кожного H2); таблиці й списки; джерела, числа, цитати з атрибуцією;
  повні назви сутностей у H1 і перших абзацах; покриття підпитань; верхні 800px — > 35% змісту, не CTA.
- **2026:** «Getting Cited» замість «Ranking»; Core Updates придушують масовий AI-контент — пріоритет first-hand;
  AI Overviews на ~48% запитів, CTR −34…61% — AIO і не-AIO міряти окремо; кластери — adaptive depth, кожна сторінка
  лінкує на хаб + 2–3 сусідні; JS ≤ 300–400 KB gzipped/route.
- **YMYL (Паркінсон):** сила trust-сигналів — джерела → видимий дисклеймер → прозорість методології → зовнішні
  авторитетні джерела → кейси; формулювання «не замінює лікаря».
- **Метрики:** індексація (Coverage) і к-сть URL з ≥ 1 показом; кліки/покази по розділах; події GA4
  (`generate_lead`, `contact_click`, `chat_start`, `cta_click`); Share of Model у ChatGPT/Perplexity/Claude/Gemini.

## Для агентів-рев'юерів
- За замовчуванням — **лише читання**; файли не змінювати без прямого прохання.
- Твердження планів звіряти з кодом (перераховувати самостійно), а не приймати на слово.
- Findings: severity (High/Medium/Low) + `файл:рядок` + суть + конкретний фікс, від найважчого. Якщо чисто — сказати прямо.

## Документація (`doc/`)
| Файли | Статус |
|---|---|
| `PERSONAL_SITE_PLAN.md`, `SERVICES_HUB_PLAN.md`, `CONSISTENCY_PLAN.md`, `HUBS_PLAN.md`, `PARKINSON_EDITORIAL_POLICY.md`, `SUBSCRIPTION_PLAN.md` | див. «Плани й статус» |
| `DEVELOPMENT_LOG.md`, `PROJECT_CONTEXT.md` | журнали (лише дописувати) |
| `COMMENTS_PLAN.md`, `AUDIT_FIXES_PLAN.md`, `AUTHOR_PAGE_PLAN.md`, `GETTING_CITED_ARTICLE_PLAN.md`, `TEPLIY_DVIR_CASE_PLAN.md`, `QUICKFIXES_PLAN.md`, `HOMEPAGE_B_PLAN.md`, `reviews/hub-spoke-changes.md` | ✅ виконані (історія) |
| `SEO.md`, `PARKINSANDR_TECH_12_WEEK_ACTION_PLAN.md`, `SEED_KEYWORDS.md`, `seed-keywords-intent-map.md` | 🗄 історичні: комерційна SEO-стратегія квітня 2026 |
| `leads.csv` | шаблон обліку заявок |
| `INDEXING_PLAN.md` | 🟢 трек індексації: що зроблено 21.09.2026, що міряти при повторному експорті GSC |
| `baseline/`, `research/`, `prompts/`, `overviews/`, частина `abaic_council/` | gitignored робочі матеріали |

## Зовнішні стандарти
- `~/Dashboard/knowledge/` — джерело правди для SEO/GEO/coding-політик
- `~/Dashboard/prompts/coding_standards.md`, `coding_specs.md` (PAGE_STANDARD_2026; Next.js-правила до static не застосовні), `seo_standard.md`
