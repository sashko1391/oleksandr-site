# План: author-сторінка `/pro-mene/` (E-E-A-T entity)

Статус: **оновлено за рев'ю Gemini + Codex** (2026-07-04).
Ціль: окрема індексована сторінка автора — сильний entity/E-E-A-T сигнал для розпізнавання й AI-цитування (узгоджено з тезою власної статті getting-cited: «author-блоки = нові беклінки для source selection»).

> ### ⚠️ Корективи з рев'ю (зафіксовано)
> 1. **Entity @id — РІШЕННЯ ВЛАСНИКА (override Codex):** перейменувати id на **`https://www.parkinsandr.tech/pro-mene/#author`** і оновити ВСІ посилання (`author`/`publisher`/`provider`/`founder`) у ~24 файлах. `/pro-mene/` стає **канонічною домівкою сутності**, а не просто ще однією сторінкою. Codex радив лишити root-id заради меншого churn, але власник свідомо обрав чистішу семантику. Заміна механічна (`.../#author` → `.../pro-mene/#author`), верифікується grep-ом.
> 2. **Site-wide byline (Codex):** inbound не звужувати до головної — зробити **клікабельні author-байлайни на ВСІХ статтях і кейсах** (лінк → `/pro-mene/`) + **обов'язковий** лінк у футері. Це і inbound, і видимий E-E-A-T-атрибут скрізь.
> 3. **Schema-ролі (Codex):** для AGENTIS — `founder`/`creator` (власний продукт), НЕ `worksFor` (звучить як найм).
> 4. **НЕ article (Codex):** взяти CSS/лейаут blog-шаблону, але БЕЗ `Article` schema, без date/read-time. Семантика: `<main>` + profile-контент, `ProfilePage` primary.
> 5. **Наратив + social proof (Gemini):** додати міні-історію «чому юрист → код» + 1-2 реальні відгуки + конкретні цифри досвіду (правдиві).

---

## 1. Навіщо + анти-канібалізація (важливо)

На головній уже є секція `#about` — але вона **маркетингова й коротка** («ідеально підходжу / не підходжу», stats, особисте). `/pro-mene/` — це **інше**:
- повноцінна **індексована entity-сторінка** з багатою `Person`/`ProfilePage` schema (сильніший сигнал для Google/AI, ніж anchor);
- **авторитетний тон** (credentials, методологія, докази), не продаючий;
- глибша «як я працюю» + принципи (юрист → договір/права на код).

**Правило (Gemini-формулювання):** головна `#about` = **тизер-кваліфікатор** («чи варто зі мною працювати?»), `/pro-mene/` = **доказова база** («чому мені можна довіряти?»). Не копіювати текст із `#about`. Self-canonical. `/pro-mene/` — ProfilePage про сутність `#author` (id лишається root-anchored, див. корективу 1).

## 2. Ідентифікація (для рев'ю)

| Параметр | Пропозиція | Нотатка |
|---|---|---|
| URL / slug | `/pro-mene/` | UA, збіг з nav «ПРО МЕНЕ» / entity-consistent. Альт: `/about/`. ⚠️ підтвердити |
| Тип | author/profile сторінка (blog-шаблон) | [[project_blog_template]] |
| Title (43 симв. ✅) | «Олександр Кравченко — юрист і веб-розробник» | Codex: 43 симв. |
| Meta desc (143 симв. ✅) | «Олександр Кравченко: магістр права КНУ і розробник на React/Next.js, засновник AI-продукту AGENTIS. Хто я, як працюю і чому це вигідно бізнесу.» | Codex: 143 симв. |

## 3. Структура (answer-first, entity-first)

- **H1:** «Олександр Кравченко — юрист, який пише код» (повне імʼя-сутність)
- **Перші 2 речення (answer-first, цитатопридатні):** хто я + унікальне поєднання (магістр права КНУ + fullstack Next.js + засновник AGENTIS).
- H2 (кожен answer-first):
  1. **Хто я** — стисле, фактичне резюме сутності
  2. **Чому юрист пішов у код** (Gemini — наратив/історія) — коротка мотивація: як юр-бекграунд дає перевагу (увага до деталей, логіка, бізнес-ризики, GDPR). Будує довіру емоційно, а не лише фактами
  3. **Освіта і фах** — магістр права КНУ ім. Шевченка; 2-й рік у комерційній розробці; Legal Tech; стек (React/Next.js, TypeScript, AI/LLM). **+ конкретні цифри** (Gemini, тільки правдиві): напр. «6 запущених кейсів», «LLM-інтеграції у N продуктах»
  4. **Як я працюю** — процес + принципи (договір, права на код і домен — юридичний кут); лінк на pillar `/blog/yak-zamovyty-sajt/` і чек-лист
  5. **AGENTIS — власний продукт** — доказ, що будую AI-продукти, не лише сайти; лінк на кейс `/projects/agentis/` + статтю `/blog/getting-cited-ai-poshuk/`
  6. **Вибрані роботи + відгуки** — 2-3 лінки на кейси (ladomyr, ace, atlas) + **1-2 реальні відгуки** (Gemini — social proof; брати з наявних testimonials на service-сторінках, тільки справжні)
  7. **Принципи / кому підходжу** — чесність, «не роблю X» (коротко, без дублю маркетингу головної)
- **Контакт-блок / CTA** → `/#chat-section`
- (опц.) особисте 1 рядок для humanization (велосипед/ополонка) — за рішенням: авторитет-only чи з «людським» штрихом

## 4. Schema (сильний entity-сигнал)
- **`ProfilePage`** → `mainEntity` = **`Person` `@id` `https://www.parkinsandr.tech/pro-mene/#author`** (нова канонічна id — рішення власника) з: `name`, `alternateName`, `jobTitle`, `description`, `alumniOf` (КНУ ім. Шевченка), `knowsAbout` [React, Next.js, TypeScript, AI Integration, Legal Tech], **`sameAs` [github.com/sashko1391, t.me/... ] — БЕЗ Patreon** (тільки профі-профілі; LinkedIn/Product Hunt — якщо власник дасть URL), **`founder`/`creator` → AGENTIS** (Organization; НЕ `worksFor` — Codex #3), `url`, `image` (монограма/фото)
- **`BreadcrumbList`** (Головна → Про мене)
- **БЕЗ `Article` schema** (Codex #4) — це profile-сторінка, не стаття.
- **Site-wide міграція id:** grep `https://www.parkinsandr.tech/#author` → замінити на `.../pro-mene/#author` у всіх файлах (homepage-визначення Person + усі `author`/`publisher`/`founder`/`provider` рефи). Верифікувати: 0 згадок старого id.

## 5. Фото (рішення: старт з монограми + TODO)
Фото-асета немає → **стартуємо з монограми «ОК»** (як у author-box getting-cited), без `Person.image`. У сторінку/план додати явний **`<!-- TODO: replace with real author photo -->`** — реальне фото сильніше за монограму для E-E-A-T, замінити коли буде (тоді додати `Person.image`).

## 6. Приватність / чесність
- Тільки правдиве й уже публічне: юрист КНУ, розробник, засновник AGENTIS, Троїцьке/Київщина (вже публічне в schema), GitHub/Telegram. Жодних приватних/фінансових деталей.
- AGENTIS як «власний продукт» — ок (публічно). Без overclaim.

## 7. Технічні інваріанти
- **CSS/лейаут** blog-шаблону, АЛЕ семантика profile: `<main>` + profile-контент, **без article-meta (date/read-time), без `Article` schema** (Codex #4). `ProfilePage` primary.
- Self-hosted шрифти inline @font-face, **без font-preload**, inline CSS, аналітика в кінці body (GA4+Clarity+Plausible), WCAG, GEO answer-first + TL;DR де доречно.

## 8. Інтерлінкінг (site-wide byline — Codex #2)
- **Клікабельний author-байлайн на ВСІХ статтях і кейсах** → `/pro-mene/`. Блог-пости мають рядок «Олександр Кравченко» у `.article-meta` — зробити його лінком на `/pro-mene/`; кейси — додати byline-лінк. Це і inbound (≥15 сторінок), і видимий E-E-A-T-атрибут скрізь.
- **Футер — обов'язковий** лінк на `/pro-mene/` (не «опц.»). Якщо footer спільний за патерном — додати на всіх.
- Головна: секція `#about` → лінк «Детальніше про мене»; author-box `/blog/getting-cited-ai-poshuk/` перенаправити з `#chat-section` на `/pro-mene/`.
- **Nav «ПРО МЕНЕ»:** реко — nav → `/pro-mene/`, секція `#about` лишається на головній. ⚠️ рішення.
- **Outbound:** /services/*, 2-3 кейси, /projects/agentis/, pillar, /blog/getting-cited-ai-poshuk/.
- +1 у sitemap → **25 URL** (Codex: зараз 24, сходиться).

## 9. Верифікація
1. JSON-LD парситься (ProfilePage+Person+Breadcrumb); title/desc межі; 1×H1
2. Site-wide re-audit: 0 broken/orphans, sitemap +1, inbound ≥3
3. Локальний HTTP 200 + скріншот; після деплою — PSI + `scripts/indexnow.sh`
4. Rich Results Test; GSC indexing (твій бік)

## 10. Оновлення памʼяті
- `[[project_site_stack]]`: +/pro-mene/, сторінок 24→25, sitemap 25
- `[[user_profile]]`: за потреби

## 11. Рішення (зафіксовано власником)
1. **Slug:** ✅ `/pro-mene/` (UA-nav, entity-consistency).
2. **Фото:** ✅ старт з монограми «ОК» + `TODO: replace with real author photo`.
3. **Nav «ПРО МЕНЕ»:** ✅ вести на `/pro-mene/`; секція `#about` на головній лишається як превʼю з лінком «Детальніше про мене».
4. **Тон:** ✅ авторитет + **1 людський штрих** (велосипед/ополонка) — НЕ у перших 800px, не з'їдає expert-контент.
5. **Patreon:** ✅ НІ. `sameAs` — тільки профі: GitHub, Telegram (+ LinkedIn/Product Hunt якщо даси URL).
6. **Entity @id:** ✅ мігрувати на `.../pro-mene/#author` site-wide (див. корективу 1).

## 12. Кроки реалізації
1. Створити `/pro-mene/index.html` (ProfilePage+Person+Breadcrumb, монограма, 7 H2, human-штрих нижче fold)
2. **Site-wide @id-міграція:** `.../#author` → `.../pro-mene/#author` у всіх файлах
3. **Site-wide байлайни:** author-meta блогів → лінк на `/pro-mene/`; byline у кейси; футер-лінк
4. Nav «ПРО МЕНЕ» → `/pro-mene/`; #about → лінк «Детальніше про мене»; author-box getting-cited → `/pro-mene/`
5. Sitemap +1 (→25); re-audit (0 broken/orphans, 0 старих #author id, inbound)
6. Локальний тест + скріншот → коміт+пуш (після «так») → PSI + IndexNow
