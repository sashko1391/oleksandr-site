# План: блок коментарів для всіх статей (наявних і майбутніх)

> Статус: чернетка на погодження (v2 — враховано code-review). Ціль — коментарі під усіма статтями (/journal/, /blog/, опц. /projects/) з власним контролем даних, без шкоди для CWV і приватності. Дата: 2026-07-13.

> **v2 review fixes:** робастний ланцюг якорів розкатки + fail-fast (High); повна XSS-політика для ВСІХ user-полів (High); валідація `parent_id` cross-slug/nesting (Medium); allowlist адміна + HMAC у Telegram callback (Medium); конкретний test-план під порожній `package.json` (Medium); scope за замовчуванням journal+blog, projects opt-in; Turnstile як явний виняток із «no external JS».
>
> **v3 (рішення власника):** сховище = **Supabase** (платний план, +дашборд-адмінка); антиспам = **Cloudflare Turnstile** з v1; scope = **journal+blog (18)**; **Telegram — той самий бот/чат**, що й ліди з головної.
>
> **v4 (ревʼю Gemini+GLM+Codex, hardening):** `posts`-таблиця + FK `ON DELETE CASCADE` замість code-whitelist для slug (High); драйвер `postgres` через **Supabase Supavisor (transaction pooler, :6543)**, НЕ важкий `supabase-js`, НЕ прямий :5432 (cold-start+конекшени); RLS — лише страховка на витік anon (service_role її ігнорує); **email прибрано з v1** (нема email-інфри → GDPR мінімізація; повернемо з Resend); `user_agent` прибрано; `ip_hash` = **HMAC**(IP_SALT, ip/64) + ротація солі; rate-limit через **Upstash/Vercel KV**, не Postgres COUNT; CORS lock + CSRF (Origin/Referer + `X-Requested-With`); правильне джерело IP (`x-vercel-forwarded-for`); Turnstile **explicit render** + резерв висоти (CLS); `callback_data` ≤64B (`a:<id>:<sig8>`); circuit-breaker на флуд у Telegram; INP: `DocumentFragment`+чанки; версіонований `/js/comments.v1.js`; retention-cron із секретом.

## 1. Контекст і обмеження

- **Стек:** статичний HTML (без фреймворку/build), Vercel (serverless `api/*.js`, Node.js), CF Worker для лід-форм, Plausible+GA4+Clarity. Уся CSS inline, шрифти self-hosted, «немає external JS окрім аналітики».
- **Наявний патерн модерації:** `api/send-chat.js` шле повідомлення в **Telegram Bot** (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`). Це готова інфраструктура для сповіщень власнику — переюзаємо для модерації коментарів.
- **Немає БД** — потрібно додати сховище.
- **Політики проєкту, які треба тримати:** JS ≤300-400 KB/route, LCP<2.5s, INP<200ms, CLS<0.1; GDPR (юрист-власник); без third-party трекінг-cookie; дизайн у палітрі milk/blue + self-hosted шрифти.
- **Обсяг:** 24 сторінки-статті сьогодні (blog 11 + journal 7 + projects 6) + усі майбутні.

## 2. Вимоги до рішення

| # | Вимога | Пріоритет |
|---|--------|-----------|
| R1 | Власність над даними (не віддавати коментарі third-party SaaS) | High |
| R2 | Приватність: мінімум PII, згода, без трекінг-cookie, право на видалення | High (YMYL/юрист-бренд) |
| R3 | 0 регресії CWV: lazy-load, поза critical path, у межах JS-бюджету | High |
| R4 | Премодерація: жоден коментар не публічний без схвалення власника | High |
| R5 | Антиспам: honeypot + rate-limit + CAPTCHA (privacy-friendly) | High |
| R6 | Дизайн у стилі сайту (палітра, шрифти, inline-подача) | Medium |
| R7 | DRY: один компонент на 24+ сторінок, легко додавати в майбутні пости | High |
| R8 | Доступність (a11y): форма з label, aria, клавіатура; WCAG AA | Medium |
| R9 | i18n: українською; дати у Europe/Kyiv | Medium |
| R10 | SEO: UGC-лінки `rel="ugc nofollow"`, без ризику індексації спаму | Medium |

## 3. Порівняння підходів

| Підхід | Володіння даними | CWV/вага | Приватність | Робота | Вердикт |
|--------|:---:|:---:|:---:|:---:|--------|
| **Власна система на Vercel+Telegram** | ✅ повне | ✅ ~5 KB | ✅ повний контроль | 🔴 ~3 дні | **Рекомендовано** |
| Cusdis (self-host) | ✅ | ✅ ~5 KB | ✅ | 🟡 ~1 день | Fallback (швидко) |
| Remark42 (self-host) | ✅ | 🟡 ~15 KB | ✅ | 🟡 контейнер | Ок, але треба хостинг |
| Giscus/Utterances (GitHub) | 🟡 у GitHub | ✅ | 🟡 | 🟢 години | ❌ аудиторія без GitHub-акаунтів |
| Disqus | ❌ | 🔴 ~1.5 MB, реклама | 🔴 трекінг | 🟢 | ❌ проти політик CWV+приватності |
| Hyvor Talk / Cusdis Cloud | ❌ хостед | ✅ | ✅ GDPR | 🟢 | 🟡 залежність + $, якщо нема часу |

**Рекомендація:** **власна система** — найкраще лягає на бренд («юрист+розробник, будую власні продукти»), уже є Telegram-модерація й Vercel-функції, дає 100% контроль над приватністю та найлегший клієнт. Cusdis (self-host на Vercel) — запасний варіант, якщо треба запустити за день.

Далі план деталізує **рекомендовану власну систему**.

## 4. Архітектура (власна система)

```
[Стаття] <section id="comments" data-slug="…">
    │  lazy-load при скролі
    ├─ GET  /api/comments?slug=…        → список схвалених (JSON)
    └─ POST /api/comments               → новий коментар (status=pending)
                                             │
                                             ├─ валідація (Turnstile, honeypot, довжина, rate-limit)
                                             ├─ INSERT у сховище (status=pending)
                                             └─ Telegram: повідомлення власнику з inline-кнопками
                                                  [✅ Схвалити] [🚫 Спам] [🗑 Видалити]
                                                       │ tap
                                          POST /api/tg-webhook (Telegram callback)
                                                       └─ UPDATE status → approved/spam/deleted
```

### 4.1 Сховище — ✅ **Supabase** (обрано §8; платний план — без auto-pause, масштаб, дашборд як бонус-адмінка)
- Postgres під капотом; та сама SQL-схема нижче.
- **Доступ (важливо, ревʼю):** serverless-функції ходять у БД **лише через легкий драйвер `postgres` (porsager)** по **Supabase Supavisor у transaction-режимі (порт `:6543`)** — це вирішує і cold-start (легкий бандл, не важкий `supabase-js`), і вичерпання конекшенів (пулер). **НЕ** прямий TCP `:5432` (connection exhaustion), **НЕ** `supabase-js` у функціях (важкий → повільний cold start). Клієнт браузера з БД не спілкується взагалі — лише з нашим `/api`.
- **RLS (реалістично):** `service_role`/прямий Postgres **повністю ігнорують RLS** — тож на бекенді авторизація доступу лишається в коді функцій, НЕ в RLS. RLS вмикаємо тільки як страховку на випадок витоку `anon`-ключа (політика anon: `SELECT` лише `status='approved'`, без INSERT/UPDATE). Не покладатись на RLS у бізнес-логіці.
- **Провізія:** застосувати схему через Supabase SQL Editor / migration, **або** через Supabase-MCP у цій сесії (`apply_migration`), якщо даси доступ до проєкту.
- Бонус: **Supabase Dashboard** = готова візуальна адмінка модерації (перегляд/зміна `status`) на додачу до Telegram-кнопок.

Схема (Postgres) — v4 із `posts`-таблицею для валідації slug на рівні БД:
```sql
-- Whitelist сторінок: slug валідний ⇔ є рядок тут (сідимо 18 slug-ів; додаємо при новому пості)
CREATE TABLE posts (
  slug TEXT PRIMARY KEY            -- 'journal/vira-i-religiya', 'blog/react-vs-tilda', ...
);

CREATE TABLE comments (
  id           BIGSERIAL PRIMARY KEY,
  slug         TEXT NOT NULL REFERENCES posts(slug) ON DELETE CASCADE,  -- невідомий slug неможливий
  parent_id    BIGINT REFERENCES comments(id) ON DELETE CASCADE,        -- 1 рівень (NULL = топ)
  author_name  TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending|approved|spam|deleted
  ip_hash      TEXT,                              -- HMAC_SHA256(IP_SALT, ip/64) лише для rate-limit
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_slug_status ON comments(slug, status);
CREATE INDEX idx_comments_created     ON comments(created_at);  -- retention-cron
-- email ПРИБРАНО з v1: нема email-інфраструктури → GDPR data-minimization (повернемо разом із Resend, Фаза 4).
-- user_agent ПРИБРАНО: PII без користі для антиспаму (Turnstile ефективніший).
-- rate-limit НЕ через Postgres COUNT — див. §4.3 (Upstash/Vercel KV).
```
> **slug-валідація на рівні БД (High-review):** `comments.slug` — FK на `posts(slug)`, тож коментар до неіснуючої сторінки фізично неможливий (жодного bloat-спаму). `posts` сідимо 18 slug-ами; для нового поста — `INSERT` slug (додати в чек-лист публікації). `ON DELETE CASCADE` прибирає коментарі при видаленні статті.
>
> **`parent_id` цілісність:** FK недостатньо — у POST-валідації (§4.2) перевіряти: parent існує, `parent.slug = new.slug`, `parent.parent_id IS NULL` (1 рівень), `parent.status='approved'`.

### 4.2 API (Vercel serverless, за патерном `send-chat.js`)
- **CORS/CSRF на обох ендпоінтах:** `Access-Control-Allow-Origin` — лише `https://www.parkinsandr.tech` (НЕ `*`, як у `send-chat.js`); на POST додатково перевіряти `Origin`/`Referer` і вимагати кастомний заголовок `X-Requested-With: fetch` (відсікає прості CSRF-форми). Джерело IP — `x-vercel-forwarded-for`/`x-real-ip` (НЕ довільний `X-Forwarded-For`).
- `GET /api/comments?slug=…` → `[{id,parent_id,author_name,body,created_at}]` (**тільки** `status=approved`). Невідомий `slug` (нема в `posts`) → `404`. Кеш `Cache-Control: public, max-age=30`.
- `POST /api/comments` body `{slug, parent_id?, author_name, body, consent:true, turnstileToken, hp:""}` (без email у v1):
  1. Zod-валідація ВСІХ полів: `author_name` 1–60, `body` 1–4000, `slug` існує в `posts` (FK/перевірка), `parent_id` — ціле або відсутнє; `hp` порожній; `consent===true`.
  2. **`parent_id` (якщо є)** — parent існує, той самий `slug`, `parent_id IS NULL`, `status='approved'`. Інакше `400`.
  3. Cloudflare Turnstile verify (server-side; врахувати одноразовість токена — replay захищає сам Turnstile).
  4. **Rate-limit через Upstash/Vercel KV** (лічильник по `ip_hash`: ≤3/хв, ≤10/год) — НЕ `COUNT(*)` у Postgres (зайві запити/конекшени в serverless).
  5. **Circuit-breaker:** якщо `pending`-лічильник (KV) за останню годину > порогу (напр. 30) — приймати коментар (INSERT), але **не** слати в Telegram (щоб флуд не завалив чат); власнику одне зведене «N нових на модерації».
  6. **Raw-текст як є** (екранування — на рендері). Жодне поле не HTML на бекенді.
  7. INSERT `status=pending` → `202 {ok:true, message:"На модерації"}`.
  8. Telegram sendMessage з inline-кнопками (`callback_data` ≤64 байти: `a:<id>:<sig8>` / `s:<id>:<sig8>` / `d:<id>:<sig8>`, `<sig8>` — 8 hex HMAC; email у повідомлення НЕ включаємо).

> **XSS-політика (обовʼязкова, стосується High-review):** усі user-controlled поля (`author_name`, `body`, а також будь-що з email/slug) на клієнті рендеряться ВИКЛЮЧНО через `textContent`/`createTextNode` — **ніколи `innerHTML`**. Якщо вмикаємо автолінкінг у `body`: дозволяти лише схеми `http`/`https`/`mailto`, будувати `<a>` програмно через `createElement`+`textContent`, ставити `rel="ugc nofollow noopener"` і `target` не задавати або з `noopener`. На бекенді — ті самі ліміти довжини як друга лінія захисту. Ніякого HTML/Markdown-рендеру у v1.
- `POST /api/tg-webhook` — приймає Telegram callback_query (**багатошаровий authZ, Medium-review**):
  1. Перевірка заголовка `X-Telegram-Bot-Api-Secret-Token` === `TG_WEBHOOK_SECRET` (інакше `401`).
  2. **Allowlist адміна:** `message.chat.id === TELEGRAM_CHAT_ID` (наявний секрет із `send-chat.js` — той самий приватний чат власника), і/або `callback_query.from.id` у `TELEGRAM_ADMIN_USER_ID`. Інакше `403` — щоб переслані/випадково доступні кнопки не могли модерувати.
  3. **HMAC-підпис у `callback_data`** (з урахуванням ліміту Telegram **64 байти**): компактний формат `a:<id>:<sig8>` (`a/s/d` = approve/spam/delete), `sig8 = HMAC_SHA256(CALLBACK_HMAC_SECRET, "a:<id>")[:8]`. На вебхуку перерахувати HMAC для отриманого `<id>` і звірити — захист від підробки id / reuse кнопок. (`a:` + 12-значний id + `:` + 8 hex ≈ 23 байти — з запасом <64.)
  4. Парс дії → UPDATE `status` (approve/spam/deleted). Ідемпотентність: якщо статус уже фінальний — не дублювати.
  5. answerCallbackQuery + editMessageText («✅ Схвалено» / «🚫 Спам» / «🗑 Видалено»).
  > Один раз виставити webhook: `setWebhook` на `https://www.parkinsandr.tech/api/tg-webhook` з `secret_token=TG_WEBHOOK_SECRET`.

### 4.3 Антиспам (R5)
- **Honeypot** приховане поле (боти заповнюють).
- **Cloudflare Turnstile** ✅ (обрано §8-2). **Explicit rendering** (ревʼю): підключати `?render=explicit`, викликати `turnstile.render('#cf', {sitekey, callback, 'error-callback', 'expired-callback'})` вручну після ін'єкції форми (динамічний DOM — auto-render не спрацює надійно). **Резервувати `min-height` під віджет** (уникнути CLS). Lazy-load лише коли секція у viewport; додати `challenges.cloudflare.com` у CSP `script-src`/`frame-src`. ⚠️ Свідомий виняток із «no external JS».
- **Rate-limit** — Upstash/Vercel KV-лічильники по `ip_hash` (§4.2 крок 4), НЕ Postgres COUNT.
- **Circuit-breaker** проти Telegram-флуду (§4.2 крок 5).
- **Премодерація** (R4) — фінальний фільтр: нічого не публічно без tap власника в Telegram.
- (Опц. пізніше) евристики стоп-слів / Akismet.

### 4.4 Приватність / GDPR (R2)
- **v1 збирає лише `author_name` + текст** (email прибрано — див. нижче). Мінімізація даних за замовчуванням.
- **Email-парадокс (ревʼю):** збирати email «для сповіщення про відповідь» **без** email-інфраструктури = порушення data-minimization. Тож у v1 email **не збираємо взагалі**. Повернемо разом з інтеграцією **Resend** (Фаза 4): подвійний opt-in, окрема згода, unsubscribe.
- **`ip_hash` = `HMAC_SHA256(IP_SALT, ip_prefix)`** (не голий `SHA256(ip+salt)`): для IPv6 хешуємо лише `/64`-префікс. `IP_SALT` — серверний секрет, **ротація щомісяця** (інакше це псевдо-, а не анонімізація). `user_agent` не зберігаємо.
- **Telegram-гігієна (ревʼю):** у чат модерації не шлемо email (його й нема) і мінімум PII; при видаленні за запитом — видаляти і рядок у БД, і повідомлення в Telegram (`deleteMessage`), щоб текст не лишався в історії чату.
- Чекбокс згоди: «Погоджуюсь із обробкою даних для публікації коментаря» + лінк на **/privacy/** (створюємо — §8-6).
- Без third-party трекінг-cookie (Turnstile — без крос-трекінгу).
- Право на видалення: запит на контакт → видаляємо (БД + TG). Самовидалення за токеном — майбутнє.
- **Retention-cron** (§6): раз/тиждень `UPDATE comments SET ip_hash=NULL WHERE created_at < now() - interval '30 days'`.

### 4.5 Frontend-компонент (R3, R6, R7)
- **Розмітка на сторінці (мінімум):**
  ```html
  <section id="comments" data-slug="journal/vira-i-religiya" aria-label="Коментарі"></section>
  <script src="/js/comments.v1.js" defer></script>
  ```
  Точка вставки — за **ланцюгом якорів із fail-fast** (див. §5), НЕ жорстко `.author-box`.
- **`/public/js/comments.v1.js`** (єдиний first-party файл, ~4–6 KB min, `defer`):
  - **Версіонована назва** (`.v1.`) — щоб дозволити immutable-кеш і водночас мати змогу швидко викотити фікс (bump `.v2.` при зміні форми/приватності/Turnstile). Альтернатива — короткий `max-age` без immutable. НЕ стабільна назва з immutable (застрягне баг у кеші).
  - Lazy-init через `IntersectionObserver` → нуль впливу на LCP/INP.
  - Інжектить власні стилі (`<style>` один раз) у палітрі сайту (milk/blue, Playfair/Manrope) — без дублювання CSS у 18 файлів.
  - `GET /api/comments?slug` → рендер тредів (1 рівень) через **`DocumentFragment`**; якщо коментарів >20 — **чанки по 10 / пагінація** (не блокувати main-thread → зберегти INP).
  - Дати `toLocaleString('uk-UA', {timeZone:'Europe/Kyiv'})`.
  - Форма (v1, без email): name, textarea, чекбокс згоди, honeypot, Turnstile (explicit render, зарезервована висота); `POST` з заголовком `X-Requested-With: fetch` → «✅ Дякую! Коментар на модерації».
  - a11y: `<label>`, `aria-live` для статусу, фокус-стани, keyboard-friendly.
  - (Опц., ревʼю) обгорнути як Custom Element `<site-comments data-slug>` для інкапсуляції — але ін'єкція тега в сторінки все одно потрібна, тож для v1 лишаємо `<section>`.
  > Виняток із «усе inline»: один first-party `/js/comments.v1.js` виправданий (DRY на 18+ сторінках). У `vercel.json` — immutable-кеш на `/js/comments.*.js` (НЕ чіпати rewrite `/js/script.js` → Plausible).

### 4.6 SEO (R10)
- Коментарі вантажаться клієнтом → **не в初 HTML** → не індексуються (це ок: менше ризику індексації спаму; свіжий UGC-сигнал для персонального блогу другорядний).
- Усі посилання в коментарях — `rel="ugc nofollow noopener"`, лише схеми `http/https/mailto`, будуються програмно (див. XSS-політику §4.2). Простіший і безпечніший дефолт v1 — **не автолінкувати** зовсім.
- (Опц.) додавати в Article JSON-LD `commentCount` + `interactionStatistic` — тільки якщо захочемо; не обовʼязково.
- Ніякого впливу на наявні `Article`/`BreadcrumbList`.

## 5. Розкатка на сторінки (R7)

> ⚠️ **Реальність якорів (виміряно 2026-07-13):** `.author-box` є лише в **7/7 journal** і **1/11 blog**, у **0/6 projects**. `.related-posts` — **11/11 blog**, 0 projects. `</article>` — **усі 24**. Тому жорсткий `.author-box` покриє меншість blog — потрібен ланцюг якорів.

- **Ланцюг вставки (перший знайдений виграє), однаковий для всіх типів:**
  1. перед `.author-box` (journal + 1 blog),
  2. інакше перед `.related-posts` (решта blog),
  3. інакше перед закриттям `</article>` (projects + універсальний fallback),
  4. **інакше — FAIL-FAST:** скрипт-інжектор падає з переліком сторінок без жодного якоря і НЕ чіпає їх (жодного silent-skip). Ці сторінки правимо вручну й перезапускаємо.
- Ідемпотентність інжектора: якщо `id="comments"` уже є — пропустити (щоб повторний запуск не дублював).
- `data-slug` = шлях без домену й слешів по краях (`blog/react-vs-tilda`, `journal/vira-i-religiya`); має збігатися зі slug-whitelist на бекенді (§4.2).
- **Пост-аудит розкатки:** кожна цільова сторінка має рівно 1 `id="comments"`, унікальний `data-slug`, підключений `/js/comments.js`; 0 broken; кількість оброблених = кількість цільових.
- **Майбутні пости:** додати блок у шаблон-клон (з якого копіюємо нові journal-пости) — тоді кожен новий пост має коментарі «з коробки». Задокументувати в CLAUDE.md / project memory.

## 6. Фази й задачі

**Фаза 0 — Рішення (блокери, §8):** сховище, антиспам-провайдер, scope, модель ідентичності, треди, сторінка /privacy/. ~30 хв обговорення.

**Фаза 1 — Бекенд (~1–1.5 дня):**
- [ ] Підняти проєкт Supabase; застосувати схему (`posts`+`comments`+індекси) + засідити `posts` 18-ма slug-ами; підключити Supabase **Supavisor pooler (:6543)**.
- [ ] Rate-limit/circuit-breaker сховище: Upstash Redis **або** Vercel KV.
- [ ] Env: `DATABASE_URL` (Supavisor pooler URI, порт 6543), `TURNSTILE_SECRET`, `TG_WEBHOOK_SECRET`, `IP_SALT`, `CALLBACK_HMAC_SECRET`, `CRON_SECRET`, `KV_*`/`UPSTASH_*` (+ наявні `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`; `TELEGRAM_ADMIN_USER_ID` опційно). `SUPABASE_SERVICE_ROLE_KEY` — тільки якщо десь потрібен REST; для БД використовуємо `DATABASE_URL`+pooler.
- [ ] `GET`/`POST /api/comments` (CORS lock, CSRF-заголовок, slug∈posts, Turnstile, KV rate-limit, circuit-breaker, `parent_id`-інваріанти).
- [ ] `POST /api/tg-webhook` (secret-token + chat-allowlist + HMAC ≤64B, апрув/спам/видалення, ідемпотентність) + `setWebhook`.
- [ ] `POST /api/cron/comments-retention` (захист `Authorization: Bearer CRON_SECRET`; `UPDATE ip_hash=NULL WHERE created_at<now()-30d`) + запис у `vercel.json` `crons` (Vercel Cron — платний план власника; UTC, ≥1/день).
- [ ] **Тест-інфраструктура (Medium-review; зараз `package.json` порожній — без deps/scripts):**
  - додати dev-залежності: `vitest` (рекомендовано) **або** нативний `node:test` (0 залежностей, якщо хочемо мінімум);
  - runtime-deps: `zod` (валідація) + `postgres` (porsager, через Supavisor pooler) + KV-клієнт (`@upstash/redis` або `@vercel/kv`);
  - `package.json`: `"scripts": { "test": "vitest run" }` (+ `"type":"module"` вже сумісний із `export default handler`);
  - unit-тести: Zod-схема (ліміти, honeypot, consent), санітизація/XSS-екранування рендеру, HMAC verify, `parent_id`-інваріанти;
  - інтеграційні з **моками** Telegram API, Turnstile verify, БД (in-memory або тестова гілка/схема Supabase);
  - e2e-сценарій: submit → `pending` → (mock callback) approve → зʼявляється у `GET`; spam/del → не зʼявляється;
  - CI-гейт: `npm test` зелений перед деплоєм.

**Фаза 2 — Frontend (~1 день):**
- [ ] `/public/js/comments.v1.js` (lazy, стилі, DocumentFragment-рендер+чанки, форма без email, Turnstile explicit+резерв висоти).
- [ ] Пілот на 1 сторінці (напр. `/journal/vira-i-religiya/`); перевірка CWV (PSI 3–4 прогони), a11y, mobile.

**Фаза 3 — Розкатка (~0.5 дня):**
- [ ] Скрипт-інжектор у **18** сторінок (journal 7 + blog 11) за ланцюгом якорів + fail-fast; пост-аудит (0 broken, 1 блок/стор., унікальні `data-slug`, = кількості цільових).
- [ ] `vercel.json`: immutable-кеш `/js/comments.*.js` + `crons` для retention.
- [ ] Створити `/privacy/` (залежність GDPR) + лінк у футер.
- [ ] Деплой, IndexNow не потрібен (контент сторінок майже не змінюється; за бажанням — sitemap lastmod).

**Фаза 4 — Майбутнє/дока:**
- [ ] Додати блок + `INSERT posts(slug)` у чек-лист/шаблон нових постів; оновити memory/CLAUDE.md.
- [ ] **Email-сповіщення про відповідь через Resend** (повертає опційне поле email: подвійний opt-in, окрема згода, unsubscribe) — знімає GDPR-блокер збору email.
- [ ] Панель модерації (опц.): проста сторінка-адмінка або далі жити на Telegram-кнопках.
- [ ] Cron очищення `ip_hash`/`user_agent`.

## 7. Ризики

- **Спам** — мітигуємо премодерацією + Turnstile + rate-limit; ризик низький.
- **CWV-регресія** — усуваємо lazy-init + defer; перевіряємо PSI до/після.
- **Вартість** — Supabase (платний план власника) + Turnstile (безкоштовний); для персонального трафіку — незначна.
- **Модераційне навантаження** — 1 tap у Telegram на коментар; за сплеску можна тимчасово вимкнути форму (flag).
- **/privacy/ відсутня** — треба створити до збору email/згоди (юридично важливо для юриста-бренду).
- **Turnstile = third-party JS** — свідомий виняток із політики; мітигуємо lazy-load + CSP, або стартуємо без нього (§4.3, §8-2).
- **XSS через user-поля** — мітигуємо `textContent`-only рендером + ліміти довжини на обох кінцях (§4.2).
- **Розкатка на «неправильний» якір** — мітигуємо ланцюгом якорів + fail-fast + пост-аудитом (§5).

## 8. Рішення (ЗАФІКСОВАНО 2026-07-13)

1. **Сховище:** ✅ **Supabase** (у власника платний план — без auto-pause, є масштаб; дашборд = бонус-адмінка модерації). Доступ із serverless через `SUPABASE_SERVICE_ROLE_KEY` (server-only) + RLS. Клієнт браузера supabase-js НЕ отримує.
2. **Антиспам-CAPTCHA:** ✅ **Cloudflare Turnstile з v1** — свідомо ухвалений виняток із «немає external JS окрім аналітики». Мітигація: lazy-load віджета лише в секції коментарів (0 впливу на LCP), додати `challenges.cloudflare.com` у CSP. + honeypot + rate-limit + премодерація.
3. **Scope:** ✅ **тільки journal (7) + blog (11) = 18 сторінок.** `/projects/` — НЕ чіпаємо (opt-in у майбутньому).
4. **Ідентичність:** ✅ у **v1 — тільки імʼя + текст, без email** (ревʼю GDPR: не збирати email без email-інфри). Email + сповіщення про відповідь — **v2 разом із Resend** (Resend-MCP доступний). Без логіну.
5. **Треди:** ✅ **1 рівень** відповідей.
6. **/privacy/:** ✅ **робимо** — створюємо сторінку політики приватності (Фаза 3) + лінк у футер; чекбокс згоди в формі веде на неї.

---
_Після погодження §8 — стартуємо з Фази 1. Орієнтовно ~3 робочі дні до повної розкатки._
