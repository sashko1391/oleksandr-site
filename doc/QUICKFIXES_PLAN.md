# План: 3 quick-fixes (OG-прев'ю · головна-блог · .gitignore)

Статус: **чернетка для рев'ю**. Дата: 2026-07-04. Усе — один пуш + IndexNow-пінг.

---

## Fix 1 — `preview.jpg` (битий OG на 16 сторінках) 🔴

**Проблема:** 16 сторінок посилаються в `og:image`/`twitter:image` на `/images/preview.jpg`, якого **немає в репо** → у Telegram/LinkedIn/Slack/Facebook і в AI-прев'ю-на-hover ці сторінки показують биту картинку. (Сторінки з власним зображенням — ladomyr/ace/agentis/juliaart — не зачеплені.)

**Рішення:** створити `public/images/preview.jpg` (1200×630, JPG — Telegram не дружить з WebP-прев'ю).
- **Варіант A (рекомендую):** headless-скріншот hero головної `www.parkinsandr.tech` (реальний, на-бренд, як робили для ladomyr).
- Варіант B: згенерувати текстову картку ImageMagick (бренд-фон #1B3A5C + імʼя + «Розробка сайтів на Next.js з AI» + домен).
- Розмір ~60-120 KB. Alt/розміри в meta вже є.

**Перевірка:** файл існує; `curl` OG-URL → 200 image/jpeg; візуальний скрін.
**⚠️ Рішення для рев'ю:** A (скріншот hero) чи B (текстова картка)?

---

## Fix 2 — Головна не лінкує 3 найновіші пости 🟠

**Проблема:** секція `#blog` на головній показує 7 старих статей, але **не** pillar `yak-zamovyty-sajt`, `chek-list-zamovlennya-sajtu`, `getting-cited-ai-poshuk`. Головна — найсильніша сторінка; свіжий контент недоотримує внутрішньої ваги й discovery.

**Рішення:** додати 3 картки у `.blog-grid` (формат наявний):
```html
<a href="/blog/{slug}/" class="blog-card">
  <div class="blog-card-label">{Категорія} · {N} хв</div>
  <h3>{Title}</h3>
  <p>{Опис 1 речення}</p>
</a>
```
Порядок: найважливіші/найновіші зверху (getting-cited GEO-кейс + pillar + чек-лист). Разом стане 10 карток (grid масштабується).

Пропоновані картки:
- **getting-cited-ai-poshuk** — «GEO-кейс · 11 хв» / «60% Share of Voice в AI-пошуку за 5 тижнів» / «Виміряний кейс AI-видимості: цифри, метод, висновки.»
- **yak-zamovyty-sajt** — «Гайд · 12 хв» / «Як замовити сайт і не згоріти» / «7 кроків: мета, бюджет, договір, права на код, запуск.»
- **chek-list-zamovlennya-sajtu** — «Чек-лист · інтерактивний» / «Чек-лист замовлення сайту: 20 пунктів» / «Відмічайте виконане, зберігайте прогрес, друкуйте.»

**Перевірка:** 3 нові `href` присутні на головній; re-audit inbound (кожна нова сторінка +1 inbound з головної).
**⚠️ Рішення для рев'ю:** додати всі 3 (→10 карток) чи лише топ-2? Прибирати старі — НЕ пропоную (усі корисні).

---

## Fix 3 — `.gitignore` (гігієна) 🟡

**Проблема:** 14 untracked-артефактів висять у `git status` (дампи/тулінг/research).

**Рішення:** створити `.gitignore`. Категорії:

| Ігнорувати (тулінг/дампи/генероване) | Рішення для рев'ю (можливо, доки — комітити?) |
|---|---|
| `.codex` | `doc/PARKINSANDR_TECH_12_WEEK_ACTION_PLAN.md` |
| `oleksandr-site.code-workspace` | `doc/jarvis.md` |
| `doc/FULL_SOURCE.txt` (464KB) | `doc/research/` |
| `doc/SOURCE_DUMP.md` (288KB) | `doc/prompts/` |
| `doc/abaic_council/` | `doc/overviews/` |
| `.env` (переконатись, що вже ігнорується) | |

**Пропонований `.gitignore` (базовий):**
```
.codex
*.code-workspace
.env
.env.*
node_modules/
.DS_Store
doc/FULL_SOURCE.txt
doc/SOURCE_DUMP.md
doc/abaic_council/
```
**⚠️ Рішення для рев'ю:** праву колонку (action-plan, research, prompts, overviews, jarvis.md) — **ігнорувати** чи **закомітити** як проєктні доки? (я схиляюсь: action-plan лишити для коміту пізніше, research/prompts/overviews — ігнорувати як робочі чернетки).

---

## Порядок реалізації
1. Fix 1: створити preview.jpg (варіант A/B за рішенням)
2. Fix 2: +3 картки на головну
3. Fix 3: `.gitignore` (+ за потреби `git rm --cached` нічого не треба — файли ще не в індексі)
4. Site-wide re-audit (0 broken/orphans, inbound лічильники)
5. Один коміт + пуш → Vercel деплой
6. Перевірити OG-URL 200 на проді + `scripts/indexnow.sh` (пінг головної + оновлених)
7. Оновити памʼять за потреби

## Питання для рев'ю (підсумок)
1. **preview.jpg:** скріншот hero (A) чи текстова картка (B)?
2. **Головна-блог:** усі 3 картки (→10) чи топ-2?
3. **.gitignore:** research/prompts/overviews/action-plan — ігнорувати чи комітити?
