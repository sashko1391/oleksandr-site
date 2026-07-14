# Audit Fixes Plan — comments backend (v2, post-review)

> Джерело: production-readiness аудит 2026-07-14 + рев'ю плану (7 findings враховано).
> Рішення власника: **send-chat — видалити**; **flood circuit-breaker — прибрати**.
> Verdict аудиту: Ready with conditions, 0 блокерів. Тести: `npm test` (vitest). Деплой: git push → Vercel.
>
> **Ключова знахідка рев'ю:** фронтенд НЕ викликає `/api/send-chat` — і чат (`index.html:2679`), і всі
> лід-форми шлють на Cloudflare Worker `oleksandr-site.sashko1391.workers.dev`. `api/send-chat.js` осиротілий.

## Легенда
`[ ]` заплановано · `[~]` в роботі · `[x]` зроблено · **TEST-FIRST** = regression-тест до фіксу

---

## Порядок (test-first там, де фікс гартує security-гілку)
0. Хелпери: `lib/security.js#safeEqual`, `lib/http.js#jsonError` (+ їх unit-тести).
1. **P6a** мінімальні regression-тести для comments POST (CSRF/rate-limit/parent/honeypot/turnstile) — **до** P2/P5.
2. P3 (видалити send-chat) → P1 (прибрати breaker) → P2 (scoped DB catch) → P5 (two-tier limit) → P4 (safeEqual).
3. **P6b** дотести на нові гілки (tg-webhook auth, 503 db_error, two-tier limit).
4. P7 (honeypot dead code + typecheck).
5. `npm test` зелений на кожному кроці. Push тільки на явне «пуш».

---

## P3 — DELETE `api/send-chat.js` + закрити resurrection path
**Рішення:** видалити файл. Осиротілий публічний Telegram-flood ендпоінт без викликачів.
- `git rm api/send-chat.js`.
- **[Rev3-High] Resurrection path:** `deploy.sh:41` і `update.sh:34` мають маппінг `["worker.js"]="api/send-chat.js"` — наступний запуск скрипта з `~/Downloads/worker.js` тихо відновить видалений ендпоінт. **Видалити цей рядок з обох скриптів.**
- **[Rev3-Medium] Оновити стейл-згадки:** `lib/telegram.js:1` коментар «reuses the same bot as api/send-chat.js» → «…as the site chat/lead worker». Історичні docs (`CLAUDE.md`, `doc/PROJECT_CONTEXT.md`, `doc/COMMENTS_PLAN.md`) — лишити як історію АБО додати рядок «(видалено 2026-07, ліди йдуть на CF Worker)».
- **[Rev3-Low/Med] Перевірка ширша:** `rg "send-chat|api/send-chat|worker\.js" -l` по всьому repo → у активному коді (scripts/api/lib/vercel.json) має бути 0; дозволені лише історичні docs-згадки з поміткою.
- **Знімає весь reviewer-ризик P3** (ламання лід-каналу, CORS/CSRF, fail-open vs fail-closed) — Worker лишається єдиним каналом.
- Якщо колись треба Vercel-native fallback — гартувати тоді (rate-limit + `isSameOriginPost` + оновити фронт-headers), не зараз.
**Ризик:** нульовий (мертвий код). Без міграцій, без тестів.

---

## P1 — REMOVE circuit-breaker + timeout на Telegram fetch
**Файл:** `api/comments.js:99-128`, `lib/telegram.js`
**Рішення:** прибрати breaker повністю — слати кнопки-модерацію **завжди**.
- Видалити блок `let flooded / bump('cb:accepted:hr') / if (!flooded)`; лишити безумовний `sendMessage(text, kb)`.
- Видалити константу `FLOOD_THRESHOLD`.
- **[Rev4-High] `signAction()` теж у try/catch:** зараз `signAction('a', id)` викликається під час побудови `kb` (`comments.js:112-115`) — ДО try/catch навколо `sendMessage` (:123). Нема `CALLBACK_HMAC_SECRET` → throw → 500, хоча коментар вже вставлено (мав бути 202). Fix: обгорнути **весь блок** (`preview` + `kb`/`text` build + `sendMessage`) в один локальний `try/catch` з логом `tg_notify_failed`; хендлер усе одно віддає 202.
- **[Rev4-Medium] `call()` має вважати TG API-помилку помилкою:** зараз `lib/telegram.js#call` просто `return res.json()` — HTTP 400 чи `{ok:false}` (напр. bad chat_id) НЕ кидає, тож локальний catch нічого не ловить і `tg_notify_failed` ніколи не логується. Fix у `call()`: `if (!res.ok || data.ok === false) throw new Error('telegram_api_failed:' + method);` після парсингу. Тоді timeout+API-помилка обидва йдуть у catch.
- **[Gemini-Medium] timeout на sync Telegram-fetch:** без breaker кожен POST робить синхронний виклик TG; якщо Telegram зависне — функція висітиме до Vercel-таймауту, з'їдаючи concurrency. У `lib/telegram.js#call` додати лише `signal: AbortSignal.timeout(3000)`.
- **[Rev3-Medium] НЕ робити `call()` глобально silent:** timeout — так, але `call()` НЕ ковтає помилки (лишається `return res.json()`, на abort кидає). Обробка помилок — **локальна**: comments.js уже має try/catch навколо `sendMessage` (лог `tg_notify_failed`, 202); у `tg-webhook.js` обгорнути `answerCallback`/`editMessageText` у власний try/catch з логом `tg_webhook_reply_failed` — щоб timeout після вже-застосованого `UPDATE` не валив webhook у 500 (інакше Telegram ретраїть; idempotent UPDATE врятує, але дублі). Причина: глобальний swallow сховав би реальні webhook-помилки й «happy» тест нічого б не помітив.
**Обґрунтування:** на низькотрафік-блозі обсяг уже обмежений rate-limit (3/хв, 10/год на IP) + Turnstile; Telegram легко тягне 30 msg/год. Breaker вирішував неіснуючу проблему ціною failure mode (втрачені pending). Знімає reviewer-Medium (некорисне «відкрий адмінку»).
**Тести:** handler-тест — happy POST (202) шле рівно один `sendMessage` з кнопками (мок TG); TG-timeout → все одно 202.
**Ризик:** низький. Без міграцій. (Опц. прибрати ключ `cb:*` — сам протухне за TTL.)

---

## P2 — Scoped DB error handling (не загальний catch)
**Файл:** `api/comments.js:38,60,65,93-97`; новий `lib/http.js`
**Reviewer-High врахований:** НЕ загальний `try/catch` на весь хендлер — інакше throw з `hashIp()` (нема `IP_SALT`) чи `verifyTurnstile()` (нема `TURNSTILE_SECRET`) піде як «db_error» 503. Очікувані 4xx — це `return`, вони не кидають, тож проблема саме з config/зовнішніми throw.

**Fix:** `lib/http.js`:
```js
export function jsonError(res, code, event, err) {
  console.error(JSON.stringify({ level: 'error', event, msg: String(err) }));
  return res.status(code).json({ error: 'temporarily unavailable' });
}
```
Обгортаємо **лише SQL-секції** з різними `event`, у **всіх трьох** роутах:
- **[Rev4-Medium] `getSql()` теж усередині try:** `getSql()` кидає на відсутній `DATABASE_URL` ДО будь-якого `await sql` (`comments.js:32`,`lib/db.js:10`). Якщо catch обгорне лише tagged-template — config-throw вилетить unhandled. Тож `getSql()` викликати **всередині** scoped-секції (або першої з них) → `catch → jsonError(res, 503, 'db_config_missing', e)`.
- **comments.js** GET select posts+comments → `db_get_comments_failed`; POST slug-check → `db_slug_check_failed`; parent-check → `db_parent_check_failed`; insert → `db_insert_comment_failed`.
- **[Rev4-Medium/High] `tg-webhook.js:41`** голий `UPDATE ... RETURNING` → `db_tg_update_failed` (503/500; але webhook — обережно з ретраями: лог + 200/500 за політикою idempotent).
- **[Rev4-Medium/High] `cron/comments-retention.js:10`** голий `UPDATE ip_hash` → `db_retention_failed` (500). `getSql()` теж у try.
- **[Rev3-Medium] `verifyTurnstile` НЕ total-function:** хибне припущення в v3 — код повертає `false` лише на `!res.ok`; сам `fetch()` кидає на network-fail (DNS/reset) до перевірки `res.ok` (`lib/security.js:89`). Fix: обгорнути fetch у `verifyTurnstile` внутрішнім try/catch → на будь-яку помилку `return false` (fail-closed: CF-outage → «captcha failed» 400, юзер ретраїть). Стає справді total-function; comments.js лишає 400 як є.
- `hashIp` кидає лише на відсутній `IP_SALT` (config error) → окремий guard/catch → `jsonError(res, 500, 'config_ip_salt_missing', e)`, НЕ 503 db.
- Guard: `const row = inserted[0]; if (!row) throw new Error('insert returned no row');` (у db_insert catch).
**Тести:** мок `getSql` кидає на insert → 503 + подія `db_insert_comment_failed`; мок без `IP_SALT` → 500 `config_*`, не 503; мок `fetch` кидає в `verifyTurnstile` → `false` (не throw); webhook: sql-throw → `db_tg_update_failed`, не unhandled; cron: sql-throw → `db_retention_failed`.
**Ризик:** низький. Без міграцій.

---

## P5 — Two-tier rate-limit (не «просто після Turnstile»)
**Файл:** `api/comments.js:77-90`
**Reviewer-Medium врахований:** якщо весь ліміт перенести ПІСЛЯ Turnstile — відкривається дешевий Turnstile-verify-flood (фейк-токен б'є CF verify, KV не списується).

**Fix — дворівнево + peek:**
1. **Pre-limit ДО Turnstile:** `bump('rl:captcha:min:${ipHash}', 60)` — стеля ~20/хв на IP; перевищення → 429 (захист від verify-flood). Fail-closed 503 на KV-помилці.
2. **[Gemini-Medium] Peek основного ліміту ДО Turnstile (read, без incr):** щоб юзер, який уже вичерпав 3/хв або 10/год, отримав 429 **до** капчі й не палив одноразовий токен. `const min = await kv.get('rl:min:${ipHash}'); const hr = await kv.get('rl:hr:${ipHash}'); if (min>=RL_MINUTE || hr>=RL_HOUR) return 429;` (get, не incr).
3. **Основний comment-limit — `bump` ЛИШЕ ПІСЛЯ успішного Turnstile, з authoritative-перевіркою returned count:** `rl:min` (3/хв) + `rl:hr` (10/год).
   - **[Rev3-Medium] peek — лише UX, не єдина перевірка:** peek racy (два паралельні запити обидва пройдуть peek). Авторитетна перевірка — на результаті `bump` (як у поточному коді): `const perMin = await bump('rl:min:...',60); const perHour = await bump('rl:hr:...',3600); if (perMin>RL_MINUTE || perHour>RL_HOUR) return 429;`. Тобто peek(get)→рання 429 для UX; після капчі bump→повторна авторитетна 429.
- Додати `get(key)` у `lib/kv.js` (тонка обгортка над `kv.get`, null→0).
**Тести:** (a) 20 запитів без валідного токена → 429 від pre-limit, `verifyTurnstile` не викликано понад стелю; (b) юзер на межі 10/год → 429 ДО виклику `verifyTurnstile` (peek); (c) успішна капча → `bump` інкрементить рівно раз; (d) bump повертає count>ліміт → 429 (authoritative, навіть якщо peek пройшов).
**Ризик:** середній — змінює порядок гілок, уважно з early-return; покрити тестом до фіксу (P6a).

---

## P4 — `safeEqual`: hash-both-sides + fail-closed guard
**Файли:** `lib/security.js` (новий хелпер), `api/tg-webhook.js:13`, `api/cron/comments-retention.js:6`
**[Gemini-High × 2]:**
- **fail-open баг:** `safeEqual(undefined, undefined)` НЕ має бути `true` — інакше відсутній `CRON_SECRET`/`TG_WEBHOOK_SECRET` + відсутній заголовок = обхід авторизації. Guard `if (!a || !b) return false` на початку.
- **length-leak:** явний `if (x.length !== y.length) return false` зливає довжину секрету через timing. Хешуємо обидві сторони → однакова довжина завжди, і leak, і throw зникають разом.
```js
// lib/security.js вже імпортує createHmac,timingSafeEqual (для signAction/verifyAction).
// Для safeEqual додати лише createHash до наявного import:
// import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
export function safeEqual(a, b) {
  if (!a || !b) return false;                     // fail-closed: нема секрету/заголовка → 401
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);                    // рівна довжина → без length-leak, без throw
}
```
> **[Rev4-Low]** `createHmac` у прикладі — НЕ для `safeEqual` (той юзає лише `createHash`+`timingSafeEqual`), а вже наявний у файлі для `signAction`/`verifyAction`. Не додавати «зайвий» імпорт — просто дописати `createHash` до існуючого рядка.
- webhook: `if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], process.env.TG_WEBHOOK_SECRET)) return res.status(401).end();` (тут `b=undefined` → guard `!b` спрацьовує → 401 ✓).
- **[Rev3-High] cron fail-open:** НЕ можна `safeEqual(auth, 'Bearer ' + process.env.CRON_SECRET)` — при відсутньому `CRON_SECRET` очікуване стає literal `'Bearer undefined'` (truthy!), тож guard `!b` НЕ спрацює і `Authorization: Bearer undefined` пройде. Явний guard ДО конкатенації:
  ```js
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error(JSON.stringify({level:'error',event:'cron_secret_missing'})); return res.status(401).end(); }
  if (!safeEqual(req.headers.authorization, `Bearer ${secret}`)) return res.status(401).end();
  ```
**Тести:** рівні → true; нерівні/різна довжина → false; **`safeEqual(undefined,'x')`/`(x,undefined)`/`(undefined,undefined)` → false, не кидає**; порожній рядок → false; **cron: відсутній `CRON_SECRET` + `Bearer undefined` → 401** (не 200).
**Ризик:** мінімальний.

---

## P6 — Handler test coverage (test-first для P2/P5)
**Файл:** новий `tests/handlers.test.js` (+ `tests/security.test.js` для `safeEqual`)
**Reviewer врахував:** мінімальні regression-тести ПЕРЕД P2/P5 (a), решта — після (b).

**P6a — regression поточної поведінки (до фіксів):**
- `isSameOriginPost` / `allowedOrigin` — чисті, без моків (CSRF 403, origin allowlist, Referer-fallback).
- comments POST через мок-`req/res` (`vi.mock` на `../lib/db.js`,`../lib/kv.js`,`../lib/security.js#verifyTurnstile`,`../lib/telegram.js`): 403 (no `x-requested-with`), 400 (invalid input / invalid parent), 429 (rate-limit — **поточна** semantics), 202 (happy).
- **[Rev3-Low] розділення:** ці тести фіксують ПОТОЧНУ поведінку. New-behavior тести для two-tier limit (peek→429 до Turnstile, authoritative post-bump) залежать від нової архітектури + `kv.get`-mock — писати їх **безпосередньо перед P5**, не в P6a, інакше зелений тест на неіснуючу поведінку.

**P6b (після фіксів):**
- 503 з коректним `event` на db-throw (P2); 500 `config_*` при відсутньому `IP_SALT`.
- two-tier: verify-flood → 429 до Turnstile (P5).
- `tg-webhook`: 401 (bad secret), 403 (chat/user не в allowlist), bad-HMAC → 200 `{ok:false}`, happy → idempotent UPDATE (мок sql повертає `[{id}]` / `[]`).
**Підхід:** res-mock зі `status().json()/end()` chainable; хендлери — чисті `(req,res)`.
**Ризик:** нульовий (тільки тести).

---

## P7 — Dead honeypot + typecheck gate
**honeypot:** `schema.js` `hp: z.string().max(0).optional()` уже валить непорожній hp на parse → `if (hp)` у `comments.js:57` недосяжний.
- Fix: зняти `.max(0)` (лишити `hp: z.string().optional()`), лишити явну перевірку в хендлері з логом `honeypot_tripped` (краще для аналітики).
- Оновити `schema.test.js`: тест «rejects a filled honeypot» переїде на handler-рівень (P6).

**typecheck (reviewer-Low: scope):** через `tsconfig.json`, не голий CLI-glob:
```json
{
  "compilerOptions": { "checkJs": true, "allowJs": true, "noEmit": true, "strict": true, "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "types": ["node"] },
  "include": ["api/**/*.js", "lib/**/*.js", "tests/**/*.js"]
}
```
- script: `"typecheck": "tsc -p tsconfig.json"`; додати `typescript` у devDeps.
- **[Gemini-Low]** тести імпортують `describe/it/expect/vi` **явно** з `'vitest'` (наша конвенція) — не глобали, тож `types:["node"]` достатньо, `tsc` не впаде на них. НЕ переходити на vitest-globals.
- Якщо виявить наявні `@type`-неточності — пофіксити або відкласти окремим кроком (не блокувати основні фікси).
**Ризик:** мінімальний.

---

## Definition of done
- [ ] `api/send-chat.js` видалено; маппінг `worker.js→api/send-chat.js` прибрано з `deploy.sh` + `update.sh`
- [ ] `rg "send-chat|api/send-chat|worker\.js"` у активному коді (scripts/api/lib/vercel.json) = 0; лише історичні docs-згадки з поміткою; `lib/telegram.js` коментар оновлено
- [ ] circuit-breaker прибрано; кнопки-модерація йдуть завжди; TG-fetch має `AbortSignal.timeout(3000)`; `call()` НЕ swallow-ить глобально (webhook reply у локальному try/catch)
- [ ] жодного `await sql` без scoped catch з коректним `event` (config ≠ db); `verifyTurnstile` — total-function (fetch у try/catch → false)
- [ ] rate-limit: peek→429 ДО Turnstile (не палить капчу), `bump` після капчі з authoritative-перевіркою returned count, pre-limit проти verify-flood
- [ ] `safeEqual`: fail-closed на undefined/порожній, hash-both-sides (без length-leak), не кидає; **cron має явний `if(!CRON_SECRET) return 401`** (не `Bearer undefined`)
- [ ] мертвий honeypot-чек прибрано, лог `honeypot_tripped` працює
- [ ] `npm test` green (16 наявних + нові handler/security тести)
- [ ] (опц.) `npm run typecheck` clean
