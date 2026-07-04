# План реалізації статті: «Getting Cited — 60% Share of Voice в AI-пошуку» (GEO-кейс)

Статус: **затверджено до реалізації** (рев'ю Gemini + Codex, 2026-07-04). Дата: 2026-07-04.
Ціль: нова блог-стаття на parkinsandr.tech — data-driven GEO-кейс на основі first-party даних AI-видимості AGENTIS. Позиціонує автора як SEO/GEO-архітектора, підсилює SEO-кластер.

> ### ⚠️ ТОЧНІСТЬ ФОРМУЛЮВАНЬ (Codex, критично)
> - **НЕ «#1 в AI-пошуку України»** (завелико для 15 prompts) → «**#1 серед відстежуваних UA legal-брендів**» / «60% Share of Voice **у відстежуваних AI-запитах**». Не абсолютний ринок.
> - **НЕ «Getting Cited replaces Ranking»** (завелико; Google каже базове SEO лишається релевантним для AI Overviews) → «**Getting Cited — окремий KPI поруч із Ranking**».
> - Конкуренти — **анонімізувати** (Конкурент A/B), без URL.
> - Методологія — **framework + 3 приклади prompts**, не весь prompt-set (ноу-хау).

---

## 1. Джерело даних (перевірено, legal-council)

Файл: `~/Documents/Repositories/legal-council/doc/marketing/baseline-2026-06-22/notes.md` (+ `baseline-2026-05-15/`).
Метод виміру: **Otterly AI Brand Report** (15 tracked prompts, Ukraine, All Engines, 14 днів) + **Bing Webmaster Tools → AI Performance (BETA)**.

**Публічні дані (дозволені до публікації):**
- **Розворот за 5 тижнів:** 15.05 — citation rate 0.49% (5/1030), відставання від лідера ~7×. 22.06 — **#1 серед відстежуваних UA legal-брендів**.
- **Share of Voice 60%** (у відстежуваних AI-запитах), 112 згадок, coverage 14.5%, sentiment +49, avg position 1.09, єдиний у quadrant «Leader».
- Brand ranking (SoV): AGENTIS 60% · далі кілька брендів по 1-20% (усі «Niche») → у статті **анонімізувати** (Конкурент A/B).
- Top prompts, де бренд цитується: у статті назвати **2-3 приклади тем** («ФОП-договори», «спадщина»), без повного списку сторінок.
- **Головний інсайт:** AI-канал виграно **попри падіння Google-органіки** → Getting Cited став **окремим KPI поруч із Ranking** (не заміною SEO); органічний GSC ≠ повна картина.

## 2. 🔒 Приватність / чесність (зафіксовано — як з ladomyr)
- **Публікуємо:** дані AI-видимості (відображають публічний AI-пошук), тезу «Getting Cited», інсайт «виграли AI попри спад органіки», методологію (Otterly + Bing AI Performance), citation-strategy висновки.
- **НЕ публікуємо:** дохід і конверсію (кількість платежів/користувачів, activation %, «монетизаційна діра»), внутрішні бізнес-слабкості, revenue-плани. Стаття — про **перемогу + метод**, не про воронку.
- **Конкуренти:** не називати зневажливо; SoV подавати як частку AGENTIS + нейтральне «leader vs niche», без атаки на бренди (ad-safe, ніша YMYL-adjacent). Конкурент-URL із citation-таблиці — не виносити поіменно.
- AGENTIS — власний продукт автора (засновник-юрист) → чесно «моє дослідження / наші дані».
- Без причинно-наслідкового overclaim: «виміряно X», а не «гарантовано завдяки Y».

## 3. Ідентифікація сторінки (для рев'ю)

| Параметр | Пропозиція | Нотатка |
|---|---|---|
| URL / slug | `/blog/getting-cited-ai-poshuk/` | ✅ concept/entity slug (Codex) |
| Тип | блог-стаття (data-driven GEO-кейс), шаблон [[project_blog_template]] |
| Title (<60) | «AI-пошук: 60% Share of Voice за 5 тижнів \| Кейс» | ✅ без overclaim (Codex); альт: «Getting Cited: 60% Share of Voice в AI-пошуку» |
| Meta desc (<155) | «Як за 5 тижнів продукт вийшов на 60% Share of Voice серед відстежуваних UA legal-брендів в AI-пошуку: методологія виміру (Otterly/Bing) і висновки для GEO.» | keyword-first |

**Кут:** «Getting Cited — окремий KPI поруч із Ranking» — власними цифрами. Не теорія, а виміряний кейс: як виглядає перемога в AI-цитуванні і як її виміряти. Демонструє GEO-експертизу → продає послуги.

## 4. Структура (blog-canon + GEO answer-first)

- **H1** (entity-first, з числом, без overclaim): «60% Share of Voice в AI-пошуку за 5 тижнів»
- **Перші 2 речення — answer-first:** прямо відповідають «як потрапити в AI-цитування» + головний результат (0.49%→60% SoV серед відстежуваних брендів).
- **TL;DR / stat-блок:** 0.49% → 60% SoV · #1 серед відстежуваних UA legal-брендів · 5 тижнів · avg pos 1.09.
- **Дисклеймер причинності (Gemini)** — прямо в статті: «результати відображають кореляцію дій і специфіку ніші, не гарантують причинність для інших проєктів».
- H2 (кожен answer-first, таблиці/списки для AI-екстракції):
  1. **Getting Cited поруч із Ranking** — цитування в AI-відповідях як окремий KPI (не заміна SEO; базове SEO лишається)
  2. **Кейс: 5 тижнів у цифрах** — before/after (таблиця SoV з **анонімними** конкурентами A/B) + **графіки**: динаміка SoV (line) + порівняння часток (bar); анонімізований скріншот AI-відповіді з цитуванням (найсильніший доказ, Gemini)
  3. **Як це виміряти** — framework: Otterly + Bing AI Performance; що трекати (SoV, coverage, sentiment, avg pos, top prompts/URLs); **3 приклади prompts**, період/країна/engines — без повної матриці (Codex)
  4. **Чому AI-видимість ≠ Google-органіка** — виграли AI-канал попри спад органіки; що це означає для KPI (сегментувати AIO/no-AIO)
  5. **Що працює для цитування** (actionable + мікроприклад structured data, Gemini): answer-first перші абзаци, topic/QA-сторінки під реальні запити, entity-consistency, цитатопридатні короткі факти, JSON-LD
  6. **Кому це важливо і з чого почати** — чек-лист виміру + перші кроки
- **Автор-блок E-E-A-T** (кінець, Gemini): коротке біо (юрист+розробник, засновник AGENTIS) + лінк на послуги — прив'язує кейс до експерта
- **CTA-banner** → /#chat-section (або /services/)
- FAQ (2-3 Q, семантика; **НЕ очікувати FAQ rich result** — Google прибрав червень 2026): «Що таке Share of Voice в AI-пошуку?», «Чим міряти AI-цитування?», «AI-видимість замінює SEO?» (відповідь: ні, доповнює)
- **Дистрибуція після публікації (Gemini):** LinkedIn + профільні спільноти — не тільки on-site SEO.

## 5. Schema
- `Article` (author → Person `#author`, datePublished/Modified, mainEntityOfPage)
- `BreadcrumbList` (Головна → Блог → стаття)
- `FAQPage` (семантика; **НЕ rich-result** — Google прибрав FAQ feature 06.2026; верифікувати «JSON-LD парситься», не очікувати rich result)
- **`Dataset` — ПРОПУСТИТИ** (Codex): має сенс лише за публічного стабільного dataset з описаною методологією; тут дані в тілі статті. Article + BreadcrumbList + FAQPage + Person (ref) достатньо.

## 6. Технічні інваріанти (обов'язково)
- Blog-шаблон (взяти з react-vs-tilda/pillar), self-hosted шрифти inline @font-face
- **НЕ font-preload** (урок ace). Inline CSS, аналітика в кінці body, WCAG, GEO answer-first + TL;DR блоки.
- Таблиця SoV — у `overflow-x:auto` контейнері (mobile).

## 7. Інтерлінкінг (Hub & Spoke)
- **Outbound:** `/projects/agentis/` (кейс продукту), `/services/ai/`, `/services/nextjs/`, `/blog/internal-linking/` (SEO-кластер), pillar `/blog/yak-zamovyty-sajt/`.
- **Inbound ≥3:** крос-апдейт `/projects/agentis/` (callout + лінк) + related-posts у `/blog/internal-linking/` + `/blog/react-vs-tilda/` (або pillar).
- **+1 до поточного sitemap count** (Codex): зараз 23 (після ladomyr) → стане **24**. Формулювати як «+1», не хардкодити — залежить від порядку реалізації.

## 8. Крос-апдейт `/projects/agentis/` (окремо, дрібно)
- Додати callout у секцію «Результати»: «Оновлення (червень 2026): за наступні ~5 тижнів AGENTIS став #1 AI-цитованим UA legal-брендом — 60% Share of Voice. Детальний розбір → [нова стаття]».
- Оновити `dateModified` кейсу.
- Це дає inbound на статтю + тримає кейс свіжим (стратегія scale-winners).

## 9. Верифікація (перед «done»)
1. JSON-LD × усі парсяться; title/desc межі; 1×H1, ієрархія H2→H3
2. Site-wide re-audit: 0 broken, 0 orphans, sitemap +1 узгоджено, inbound статті ≥3
3. Локальний HTTP 200 + скріншот; після деплою — PSI (3 прогони)
4. Rich Results Test = **Article** (FAQ rich result Google прибрав — лише валідність JSON-LD); GSC indexing (твій бік)
5. **Приватність (фінальний grep):** жодних revenue/конверсійних чисел, «монетизаційної діри», імен конкурентів на сторінці
6. **Точність (фінальний grep):** немає «#1 в AI-пошуку України» (абсолют) і «replaces Ranking» — лише «серед відстежуваних» / «окремий KPI»

## 10. Оновлення памʼяті після реалізації
- `[[project_site_stack]]`: блог 10→11, sitemap 23→24
- `[[project_seo_plan]]`: нова GEO-стаття з first-party даними — топова E-E-A-T-одиниця кластера

## 11. Рішення (зафіксовано після рев'ю Gemini + Codex)
1. **Slug:** ✅ `/blog/getting-cited-ai-poshuk/`. **Title:** «AI-пошук: 60% Share of Voice за 5 тижнів | Кейс» (без overclaim).
2. **Конкуренти:** ✅ анонімізувати (AGENTIS · Конкурент A · Конкурент B), без URL.
3. **Методологія:** ✅ framework + 3 приклади prompts + період/країна/engines/метрики; НЕ повна матриця з 15 промптів.
4. **Крос-апдейт `/projects/agentis/`:** ✅ робити РАЗОМ зі статтею (найчистіший inbound + freshness).
5. **Topic-сторінки:** ✅ назвати 2-3 приклади тем («ФОП-договори», «спадщина»), без повного списку стратегічних сторінок.

**Додатки з рев'ю (внесені у розділи 4-5):** графіки SoV (динаміка + порівняння) + анонімний скріншот AI-цитування; автор-блок E-E-A-T; in-article дисклеймер причинності; секція дистрибуції; Dataset прибрано; формулювання без overclaim.
