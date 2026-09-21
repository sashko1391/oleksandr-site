# Subscription Plan — RSS + Telegram-канал + Email (Resend)

> Мета: дати читачам «Поза кодом» / блогу підписатися, щоб володіти аудиторією поза Patreon/Substack.
> Рішення власника: канали = **RSS + Telegram-канал + Email**; автоматизація = **публік-скрипт** `scripts/announce.mjs`.
> Web Push — відкладено (окрема майбутня фаза).
> Принцип: реюз усього загартованого стеку коментарів (Supabase pooler, Upstash KV, Turnstile, honeypot,
> rate-limit, ipHash, retention-cron, vitest handler-тести). Деплой: git push → Vercel. Комітити тільки на «пуш».

## 🟢 СТАТУС: відновлено 2026-09-21 (пауза з 2026-09-18 знята)
**Чому пауза:** підписку відклали до нової IA. Ф2 (хаби) і Ф3 (особиста головна + меню) її дали, тож причина відпала.

**Зроблено — Фаза 0.1 (RSS): коміт `97303d1`, у проді з 2026-09-18** — `/feed.xml`, 28 items.
- `scripts/build-feed.mjs`, `scripts/inject-rss.mjs`, `public/feed.xml`, `tests/feed.test.js`,
  `vercel.json` (headers `/feed.xml`), `lib/telegram.js` (`sendToChannel`), rss-`<link>` у head кожної
  HTML-сторінки, крім `404.html`.

**Зроблено — Фаза 0.1b (фіди розділів), 2026-09-21:** підписка по темах, без бекенду й без зовнішніх залежностей.
- `/parkinson/feed.xml` (5), `/code/feed.xml` (6), `/creative/feed.xml` (4), `/journal/feed.xml` (16).
  Склад кожного — до 30 найновіших постів розділу за `HUB_MEMBERS` (`scripts/link-policy.mjs`); тест звіряє
  записаний файл і з маніфестом, і з тим, що згенерував би скрипт зараз, тож фід не розійдеться з розділом
  непомітно. Архів `/blog/` і комерційний `/services/` власного фіда не мають.
- `build(items, feed)` рендерить канал переданого фіда; `collect()` більше не ріже до 30 — ліміт у `itemsFor`
  на кожен фід окремо; кожен item знає свій файл-джерело (`source`).
- `inject-rss.mjs` ставить `alternate` фіда розділу **першим** на хабі й на постах розділу (23 сторінки;
  рішення — чиста `tagsFor()`, ідемпотентно), видимі посилання — у блоці «Поруч» трьох хабів і окремим
  блоком «Підписка» в `/journal/`.
- `vercel.json`: ті самі Content-Type і кеш 30 хв на `/:section/feed.xml`.
- Логотип каналу — `public/images/rss-logo.png` 144×144 із заявленими розмірами (RSS 2.0 інакше вважає 88×31).
- Тести: `tests/feed.test.js` 55 + посилений `tests/policy.test.js`. Мутаційна перевірка: 20 мутантів — 20 убито
  (після рев'ю Codex додано: дубль `<item>`, зниклий `<pubDate>`, підмінений `<title>` при тому самому GUID,
  переставлені item-и, зламаний XML, лінк у коментарі, зворотний порядок alternate, чужий фід на сторінці).

**Зроблено — Фаза 0.2 (Telegram-канал), 2026-09-21:** канал `t.me/parkinsandr` створено власником, бот доданий
адміністратором із правом публікації, `TELEGRAM_CHANNEL_ID` — у Vercel env (редеплой зроблено).
- `scripts/announce.mjs <розділ/slug> [--dry] [--only=tg|feed] [--force]` — регенерує фіди й постить у канал
  через наявний `sendToChannel()`. Формат поста: жирний заголовок, тизер із `description`, голий canonical
  (щоб Telegram намалював OG-картку) і один хештег.
- Хештег береться з `HUB_MEMBERS.primary`, а не з `articleSection`: секція є лише в 12 із 28 постів і суперечить
  сама собі (`Есеї`/`Проза`/`Журнал`/`Блог` як синоніми).
- Секрети — лише з gitignored `.env` або середовища; стан «що вже анонсовано» — gitignored `.announce-state.json`
  (повторний прогін нічого не дублює, `--force` перекриває).
- Видимі посилання «Канал у Telegram →» — на чотирьох хабах поруч із RSS; URL — одна константа `TELEGRAM_CHANNEL`
  у `scripts/link-policy.mjs`, тест ловить появу другої адреси.
- Тести: `tests/announce.test.js` (13) + 2 у `tests/hubs.test.js`. Мутаційна перевірка: 6 мутантів — 6 убито
  (зокрема «без HTML-екранування» і «посилання загорнуте в `<a>`», що вбиває прев'ю).

**Не зроблено:** Фаза 1 Email (Resend + DNS `send.parkinsandr.tech` + Supabase `subscribers` + API + віджет +
`/privacy/`); email-частина `announce.mjs` (Фаза 2, per-recipient трекінг).

**Переглянуто під нову IA:**
- ✅ `SECTIONS` у `build-feed.mjs` лишається джерелом постів (journal + blog), розділи — з `HUB_MEMBERS`.
- Підписка по темах: RSS ✅; для email ті самі 4 розділи стануть сегментами в `subscribers`.
- Email-список = канал анонсів платних релізів — зв'язати з планом монетизації (Ф5, ⛔ заблоковано).

## Стан на старті (звірено 2026-07-14)
- RSS-фіда НЕМАЄ (ні `feed.xml`, ні `<link rel=alternate>` у head).
- Telegram-каналу немає (лише особистий контакт-лінк `t.me/+phone`).
- Форми підписки немає.
- 21 пост (journal + blog), Article+BreadcrumbList JSON-LD з датами на кожному → джерело метаданих для фіда/анонсів.

---

## Фаза 0 — RSS + Telegram-канал (низький ризик, ship першим)

### 0.1 RSS-фід (`/feed.xml`)
- **Генератор** `scripts/build-feed.mjs` (Node ESM, як інші scripts/): сканує `public/journal/*/index.html` +
  `public/blog/*/index.html`, тягне з кожного `<title>`, `meta[name=description]`, canonical URL, og:image та
  `datePublished`/`dateModified` з JSON-LD Article → пише `public/feed.xml` (RSS 2.0).
- **Поля item:** title, link (canonical), description (meta desc), pubDate (datePublished, RFC-822), guid (=link,
  isPermaLink), `<category>` (жанр), `<enclosure>` (og:image). **[Rev2-Low] Автор — `<dc:creator>Олександр Кравченко</dc:creator>**
  (Dublin Core, `xmlns:dc`), бо RSS 2.0 `<author>` очікує email-формат, а не просто ім'я.
- **[Rev-Medium] Дати строго в UTC:** конвертувати `datePublished` (JSON-LD) → ISO 8601 UTC (`Z`) → RFC-822 у
  `build-feed.mjs`. Локальний час зламає сортування в рідерах і даватиме «нові» дублі при регенерації фіда.
- **Channel-мета:** title «parkinsandr.tech — Поза кодом і не тільки», link, description, language uk, `<atom:link rel=self>`.
- **Сортування:** за pubDate desc; ліміт напр. 30 останніх.
- **Scope:** старт — один комбінований `/feed.xml` (усе); фіди розділів додано у Фазі 0.1b (2026-09-21).
- **`<link rel="alternate" type="application/rss+xml" …>`** у head кожної HTML-сторінки, крім `404.html`;
  на сторінках розділу першим іде фід розділу. Скрипт-інжектор `scripts/inject-rss.mjs`, ідемпотентний.
- **Кеш:** `vercel.json` — `Cache-Control: public, max-age=1800` на `/feed.xml`.
- **Запуск:** частина `announce.mjs` (Фаза 2) + разово зараз для наявних постів.
- **Тест:** валідність XML (парситься), кількість items = кількість постів, дати у RFC-822.

### 0.2 Telegram-канал
- **Разово (вручну, у Telegram):** створити публічний канал (напр. `@parkinsandr` / `t.me/parkinsandr`),
  додати наявного бота адміном каналу з правом постингу.
- **Env:** `TELEGRAM_CHANNEL_ID` (`@username` або числовий `-100…`) — окремо від `TELEGRAM_CHAT_ID` (приватний модерочат).
- **Авто-пост:** `announce.mjs` → `sendMessage` у канал. NB: для каналу НЕ вимикати web-preview (хочемо OG-картку).
  Формат: `<b>Заголовок</b>` + 1-2 речення тизер + лінк + `#жанр`. Окрема невелика функція в `lib/telegram.js`
  (напр. `sendToChannel(text)`), бо наявна `sendMessage` зашита на `TELEGRAM_CHAT_ID`.
- **На сайті:** видима кнопка «Читати в Telegram» → `t.me/parkinsandr` на `/journal/` (шапка), у футері постів,
  можливо в trust-блоці головної. Статичний лінк, без бекенду.
- **Тертя:** нульове — читач підписується нативно в Telegram; підписка живе в Telegram, не в нас.

---

## Фаза 1 — Email підписка (Resend + Supabase, double-opt-in)

### 1.0 Передумови (deliverability, ДО коду)
- **Верифікація домену в Resend:** `send.parkinsandr.tech` (рішення власника). DKIM+SPF+DMARC на сабдомені;
  оскільки From = `@send.parkinsandr.tech`, DMARC-alignment витриманий (From-домен = DKIM/Return-Path домен).
- **From:** `Олександр Кравченко <news@send.parkinsandr.tech>`, `Reply-To:` реальний. *(Тред-офф: у From видно
  сабдомен `send.`, не корінь. Прийнятно; альтернатива «видимий @parkinsandr.tech» вимагала б верифікації кореня в Resend.)*
- **[Rev-High] DNS на КОРЕНЕВОМУ домені (навіть якщо з нього не шлемо):** щоб спамери не спуфили `parkinsandr.tech`
  і не топили репутацію сабдомену:
  - root SPF: `v=spf1 -all` (корінь не шле пошту).
  - root DMARC: `_dmarc.parkinsandr.tech` → `v=DMARC1; p=reject; rua=mailto:dmarc@parkinsandr.tech`.
  - subdomain DMARC: `_dmarc.send.parkinsandr.tech` → `p=quarantine` (потім `reject`) + обов'язково `rua=` для моніторингу репортів.
- **Env:** `RESEND_API_KEY`, `EMAIL_HASH_SECRET` (HMAC для suppression, див. 1.1).
- Resend free-tier: 3000/міс, **100/день**. **[Rev-Low] Warmup + Patreon-import:** НЕ імпортувати аудиторію одразу як
  `confirmed`. Ре-engagement: імпорт як `pending` → лист «переїхав з Patreon, підтвердь підписку» → батчами 20-30/день.
  Різкий сплеск з нового домену без warmup = спам-флаг у Gmail.

### 1.1 Дані (Supabase)
- **[Rev2-Medium] Міграція починається з** `CREATE EXTENSION IF NOT EXISTS citext;` (інакше `email citext` впаде).
  *(Альтернатива без розширення: `email text` + unique-index на `lower(email)` — але citext є на Supabase, беремо його.)*
- **Таблиця `subscribers`**: `id bigint identity`, `email citext unique`, `status text`
  (`pending`|`confirmed`|`unsubscribed`, CHECK), `email_hash text` (HMAC email, suppression),
  **`confirm_token_hash text`, `unsubscribe_token_hash text`** (див. нижче), `consent_at`, `confirmed_at`,
  `ip_hash text`, `source text`, **`confirm_sent_at timestamptz`, `confirm_send_count int default 0`** (durable cooldown),
  `created_at timestamptz default now()`.
- **RLS:** увімкнути, БЕЗ anon-політик (доступ лише через serverless pooler) — як `comments`.
- **Індекси:** unique(email); index(status); index(confirm_token_hash); index(unsubscribe_token_hash); index(email_hash).
- **[Rev2-High] Токени в БД — лише ХЕШІ, не plaintext:** raw-токен (uuid/random) живе тільки в листі/URL; у БД —
  `sha256(raw)`. На API хешуємо вхідний токен і шукаємо за хешем. При витоку БД токени не стають bearer-ключами
  для confirm/unsubscribe. (Патерн password-reset токенів.)
- **[Rev-Medium] `unsubscribe_token_hash` — IMMUTABLE:** НЕ обнуляти після відписки (архівні листи досі лінкують raw) —
  лише міняти `status`; повторна відписка ідемпотентна. `confirm_token_hash` — обнуляти після підтвердження (одноразовий).
- **[Rev-High] Suppression = HMAC-хеш, не plaintext:** `email_hash = HMAC(EMAIL_HASH_SECRET, lower(email))` пишеться
  при підписці. Повне стирання PII (right-to-erasure або авто-очистка) затирає `email`/`ip_hash`, ЛИШАЄ `email_hash`
  як suppression-ключ → на новій підписці порівнюємо хеш вхідного email, щоб не переспамити відписаних. GDPR-чисто.
- **Retention-cron:** `pending` без підтвердження > 7 днів — видаляти; знеособлювати `ip_hash` > 30 днів;
  `unsubscribed` — затирати `email` (лишати `email_hash`) через N днів.

### 1.2 Бекенд (Vercel serverless, реюз `lib/`)
- **`POST /api/subscribe`** — реюз `isSameOriginPost` (CSRF), Turnstile verify, honeypot, `hashIp`.
  Zod: `email` (валідний, lower, max 254), `consent: literal(true)`, `turnstileToken`, `hp`.
  Логіка:
  - email не існує → INSERT `pending` + `confirm_token_hash` + `email_hash`, set `confirm_sent_at=now(), confirm_send_count=1` → Resend confirm.
  - `pending` → повторно слати confirm (raw-токен уже не знаємо → генеруємо новий, оновлюємо hash), під rate-limit.
  - `confirmed` → **не палити**, generic 202 (anti-enumeration).
  - `unsubscribed` / `email_hash` у suppression → тихо ре-opt-in через новий confirm.
  - Завжди generic 202 «Перевірте пошту для підтвердження» (не leak-ати статус).
  - **[Rev-High] Anti email-bombing на ОДНУ адресу — 2 шари:**
    - KV per-email: `bump('rl:sub:email:'+emailHash, 600)` ≤1/10хв + `rl:sub:email:day` ≤3/24год (fail-closed).
    - **[Rev2-Medium] Durable backstop у БД:** перед Resend перевіряти `confirm_sent_at`/`confirm_send_count` —
      cooldown переживає втрату KV/TTL (KV ефемерний; сам по собі KV атаку не спиняє після скидання).
- **[Rev2-High] Confirm — теж GET рендерить, POST діє:** симетрично unsubscribe. Mail-сканер, префетчнувши GET-confirm,
  авто-підтвердив би підписку, яку людина не клікала → слабшає double-opt-in (а це наш юр. доказ згоди).
  - **`GET /subscribe/confirm?token=…`** — сторінка з кнопкою «Підтвердити підписку» (form POST). `Referrer-Policy: no-referrer`.
  - **`POST /api/subscribe/confirm`** (token у тілі) — idempotent:
    `UPDATE … SET status='confirmed', confirmed_at=now(), confirm_token_hash=NULL WHERE confirm_token_hash=sha256($token) AND status='pending' RETURNING id`;
    0 rows → вже підтверджено (→ thank-you) або невалідний (→ «застарів»). Другий паралельний клік не пише в БД.
- **[Rev-Critical + Rev2-Medium] Unsubscribe — один ендпоінт, метод-бранч, БЕЗ same-origin CSRF:**
  - **`GET /api/unsubscribe?token=…`** — рендерить сторінку з кнопкою (form POST) або non-mutating. Не 405/JSON
    (людина може відкрити List-Unsubscribe URL вручну). `Referrer-Policy: no-referrer`.
  - **`POST /api/unsubscribe`** — діє: `unsubscribe_token_hash` → `status=unsubscribed` (hash НЕ обнуляти). Ідемпотентно.
  - **[Rev2-Medium] Auth-модель окрема від коментарів:** unsubscribe НЕ використовує `isSameOriginPost` — RFC 8058 POST
    від Gmail/Yahoo не має `Origin`/`X-Requested-With` і був би відхилений. Авторизація = **сам bearer-токен** (unguessable
    → CSRF не застосовний). Явно НЕ реюзати CSRF-guard тут.
  - **RFC 8058 one-click** у листах: `List-Unsubscribe: <https://…/api/unsubscribe?token=X>, <mailto:…>` +
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Той самий URL приймає і GET (людина), і POST (one-click).
- **Scoped error handling** з різними event (config_* → 500, db_* → 503) — як у коментарях. `getSql()` у try.
- **Resend виклик** — окремий `lib/email.js` (fetch Resend API з `AbortSignal.timeout`, кидає на !ok — патерн `lib/telegram.js`).

### 1.3 Листи (Resend)
- **Confirmation email:** HTML + plain-text, кнопка «Підтвердити підписку» → confirm-лінк, пояснення, від кого.
- **Кожен розсилковий лист:** заголовок+тизер+CTA «Читати на сайті», футер з фізичною ідентичністю відправника
  (CAN-SPAM) + **one-click unsubscribe** лінк, заголовки `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- Шаблони — прості inline-HTML (бренд-кольори #1B3A5C/#5BA4D9/#F5F0EA), без зовнішніх ресурсів.

### 1.4 Фронтенд віджет
- **`public/js/subscribe.v1.js`** — дзеркалить патерни `comments.v1.js`: lazy IntersectionObserver, Turnstile explicit
  (той самий site key), textContent-only, honeypot, `x-requested-with: fetch`, `/privacy/`-лінк у згоді.
  Поля: email + consent-checkbox + Turnstile. Статуси: успіх «Перевірте пошту», 429, помилка.
- **Розміщення:** `/journal/` (над списком або в кінці), у футері постів (біля коментарів), картка на головній.
- **`vercel.json`:** immutable-кеш на `/js/subscribe.v1.js`. **[Rev2-Low] Version-in-filename bump policy:** будь-яка зміна
  consent/Turnstile/submit → новий файл `subscribe.v2.js` + оновити `<script src>` (як `comments.v1.js`). Immutable + фіксоване
  ім'я застрягло б у браузерах з багом; версія в імені = коректна інвалідизація.

### 1.5 Правові / GDPR (ти юрист — робимо строго)
- **Double-opt-in** = доказ згоди (`consent_at` + `ip_hash`).
- **Unsubscribe** у кожному листі (GET-сторінка+POST) + `List-Unsubscribe`/`List-Unsubscribe-Post` headers.
- **[Rev-High] Storage limitation + right-to-erasure ≠ suppression:** розвести дві дії:
  - *Unsubscribe* → `status=unsubscribed`, лишаємо `email_hash` (suppression), затираємо plaintext через N днів.
  - *Erasure* (явний запит) → DELETE PII негайно (`email`,`ip_hash`), лишаємо `id`+`email_hash` (щоб не переспамити).
- **Оновити `/privacy/`:** секція «Розсилка» — дані (email, час згоди, IP-hash, email_hash), процесор (Resend, США — SCC),
  строк зберігання, право на стирання, як відписатися.

### 1.6 Тести (vitest, патерн `tests/handlers.test.js`)
- `/api/subscribe`: 403 (no CSRF), 400 (невалідний email / no consent), honeypot log, 429 (IP rate-limit),
  429 (per-email rate-limit — 4-й лист на адресу за добу), 202 (новий→pending, INSERT+Resend), 202 без leak для
  вже-confirmed (без повторного INSERT/Resend).
- `POST /api/subscribe/confirm`: валідний хеш→confirmed; **подвійний клік — 2-й не пише в БД** (0 rows); невалідний→«застарів»;
  токен зберігається/шукається як `sha256`, не plaintext.
- `POST /api/unsubscribe`: валідний→unsubscribed; повторний→ідемпотентно (hash не обнулено); **приймає POST без Origin/XRW**
  (RFC 8058, token-auth, НЕ isSameOriginPost); GET рендерить, не мутує.
- durable cooldown: 2-й confirm-запит до тієї ж адреси в межах cooldown → не викликає Resend навіть при скинутому KV.
- suppression: підписка email, що вже `unsubscribed` (за `email_hash`) → не потрапляє в список без нового confirm.
- Моки: Supabase (`getSql`), Resend (`lib/email.js`), Turnstile, KV.

---

## Фаза 2 — `scripts/announce.mjs <slug>` (фан-аут на публікації)

Один скрипт, який на публікації нового поста робить усе:
1. Читає `public/<section>/<slug>/index.html` → canonical URL, title, description, og:image, жанр, datePublished.
2. **Регенерує** `public/feed.xml` (виклик `build-feed.mjs`).
3. **IndexNow** пінг (реюз логіки `scripts/indexnow.sh`).
4. **Telegram-канал** пост (`sendToChannel`, з web-preview).
5. **Email:** вибірка `confirmed` з Supabase → Resend send з per-recipient unsubscribe-токеном.
6. **[Rev-Critical] Per-recipient трекінг доставки, НЕ per-slug:** таблиця `announcement_deliveries(slug, subscriber_id,
   status pending|sending|sent|failed, resend_id, updated_at, PK(slug, subscriber_id))`. Груба `announcements(slug, channel)`
   небезпечна: падіння на 50-му листі позначить slug «sent», а 51-100 не отримають. TG/feed канали можуть лишитись per-slug.
7. **[Rev2-High] Закрити crash-after-send-before-mark window + idempotency:** послідовність на кожного отримувача —
   (a) INSERT/claim рядок `sending` ДО виклику Resend; (b) send з **Resend `Idempotency-Key: announce:<slug>:<subscriber_id>`**
   (детермінований → якщо скрипт упав ПІСЛЯ send, але ДО `sent`, retry з тим самим ключем не задублює лист на боці Resend);
   (c) mark `sent` (+ resend_id). Retry шле лише рядкам без `sent` (`sending`/`failed`/відсутні) — той самий ключ їх дедупить.
   `announce.mjs --only=email <slug>` = безпечний resume.
7. **Батчинг під ліміт:** слати чанками ≤ денного ліміту Resend (100/день free); решту переносити на наступний прогін.
   Логувати «відправлено N, перенесено M» — не мовчати (no-silent-caps).
8. **`--dry`** прапорець: показати, кому б пішло, без відправки. **`--only=tg|email|feed`** для точкового ре-ану/retry.

---

## Env / прекондишени (підсумок)
| Env | Для чого | Звідки |
|-----|----------|--------|
| `RESEND_API_KEY` | Email | resend.com dashboard |
| `EMAIL_HASH_SECRET` | HMAC email_hash (suppression) | згенерувати (як IP_SALT) |
| `TELEGRAM_CHANNEL_ID` | Авто-пост у канал | @parkinsandr / -100… після створення |
| DNS: DKIM/SPF/DMARC на `send.parkinsandr.tech` **+ SPF `-all` та DMARC `p=reject` на корені** | Deliverability + anti-spoof | Resend verify + реєстратор/Vercel DNS |
| (реюз) `TURNSTILE_SECRET`, `IP_SALT`, `DATABASE_URL`, KV, `CRON_SECRET` | Anti-abuse/DB | уже є |

## Порядок виконання
1. **Фаза 0** (RSS + TG-канал) — швидко, низький ризик, цінність одразу. RSS ship + канал створити + лінки на сайті.
2. **Фаза 1.0** (Resend domain verify / DNS) — паралельно, бо DNS-пропагація має лаг.
3. **Фаза 1.1–1.6** (Email підписка) — міграція → бекенд → листи → віджет → /privacy/ → тести.
4. **Фаза 2** (announce.mjs) — коли є ≥1 email-канал; зв'язати всі канали.
5. **Пізніше:** Web Push (окремий план), welcome-серія.

## Definition of done (по фазах)
- **Ф0:** `/feed.xml` валідний (feedvalidator), `<link>` у head усіх сторінок, TG-канал живий + лінки на сайті.
- **Ф1:** форма → confirm-лист → підтвердження → запис `confirmed`; unsubscribe працює; `/privacy/` оновлено; тести зелені;
  domain у Resend verified (DKIM/SPF/DMARC pass).
- **Ф2:** `announce.mjs <slug>` фанаутить у feed+TG+email ідемпотентно; `--dry` працює; ліміти логуються.

## Рішення власника (зафіксовано 2026-07-14)
- **Telegram-канал:** `@parkinsandr` / `t.me/parkinsandr`.
- **Sender-домен:** `send.parkinsandr.tech`.
- **Email source-of-truth:** **Supabase** (володіємо consent-даними) + Resend лише для доставки (per-recipient
  unsubscribe-токени наші). НЕ Resend Audiences.

## Рев'ю плану (раунд 1: /gemini + /glm, 2026-07-14) — усе враховано
- **Critical:** unsubscribe GET→POST (mail-сканери клікають GET); per-recipient трекінг доставки (не per-slug).
- **High:** DMARC/SPF на корені + rua; email-bombing на одну адресу → per-email rate-limit; suppression = HMAC-хеш, не plaintext.
- **Medium:** immutable unsubscribe-token; confirm idempotent проти подвійного кліку; RSS-дати в UTC.
- **Low:** Patreon-import warmup (pending, не confirmed; батчі 20-30/день); token-leak → `Referrer-Policy: no-referrer`.

## Рев'ю плану (раунд 2: /codex, 2026-07-14) — усе враховано
- **High:** confirm теж GET→POST (сканер авто-підтверджує, слабшає double-opt-in); токени в БД як SHA-256 хеші, не plaintext
  (bearer при витоку); crash-after-send window → claim `sending` до send + Resend `Idempotency-Key`.
- **Medium:** unsubscribe POST БЕЗ isSameOriginPost (RFC 8058 не має Origin) — auth = token; List-Unsubscribe URL приймає і GET
  (людина), і POST (one-click); `CREATE EXTENSION citext`; durable confirm-cooldown у БД (KV ефемерний).
- **Low:** RSS `<dc:creator>` замість `<author>` (email-формат); version-in-filename bump policy для `subscribe.v1.js`.
