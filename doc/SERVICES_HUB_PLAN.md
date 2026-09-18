# Ф1 — Комерційний хаб `/services/` (детальний план реалізації, v2)

> Частина `doc/PERSONAL_SITE_PLAN.md` (фаза Ф1). Статус: **у роботі** — крок 1 ✅ (2026-09-18); рішення власника
> прийнято (див. «Відкриті питання»); далі крок 2.
> Мета фази: винести всю комерційну частину в окремий хаб `/services/` і перепривʼязати на нього CTA,
> **не змінюючи головну**. Після Ф1 зміна головної (Ф3) більше не ламає заявки.
> **Після baseline Ф0 (2026-09-18):** сайт не є суттєвим каналом заявок, комерційні запити не ранжуються →
> мета — дати послугам дім і сторінку, що переконує прямих відвідувачів. Статистичного моніторингу немає —
> обсяги замалі для вибірки; перевірки функціональні.
> Стандарти: `~/Dashboard/prompts/coding_specs.md` (PAGE_STANDARD_2026, адаптовано до статичного HTML —
> Next.js-специфіка не застосовується) + `~/Dashboard/prompts/seo_standard.md`.
> **v2:** враховано рев'ю Codex (2026-09-18): класифікація `@id`, маніфест залежностей чату, двошаровий валідатор,
> захищені правила перепривʼязки, порядок секцій за стандартом, a11y, матриця відкату, розкриття передачі історії чату.

## Scope guard — чого у Ф1 НЕ робимо
- **Головну не чіпаємо взагалі** — ні контент, ні розмітку, ні чат. DoD: `git diff public/index.html` порожній.
- `/#blog` (12 JSON-LD breadcrumb items у `blog/*`) — **Ф2**.
- `@id` `https://www.parkinsandr.tech/#business` — **не змінюється ніколи** (stable `@id`); у Ф3 переїжджає лише
  повний вузол ProfessionalService на `/services/` (змінюється `url`, не `@id`).
- `@id` `https://www.ladomyr.kiev.ua/#business` — **сутність клієнта**, не чіпати ні в Ф1, ні пізніше.
- Пости не переносимо; `lastmod` змінених сторінок не бампаємо (зміна CTA — не суттєва зміна контенту).

## Факти (звірено 2026-09-18, перевірено Codex)
| Що | К-сть | Де | Тип | Дія у Ф1 |
|---|---|---|---|---|
| `href="/#chat-section"` — комерційні CTA | 25 | 22 файли: `services/*` (5), `projects/*` (6), `blog/*` (10), `pro-mene` (1) | видимий `<a>` | → `/services/#chat` |
| `href="/#chat-section"` — «напишіть мені» про помилки | 3 | `journal/parkinson-shcho-robyty` (1), `journal/rannii-parkinsonizm` (2) | видимий `<a>` у блоці виправлень | → **особистий контакт**, НЕ продажний чат |
| `"item": ".../#scenarios"` | 5 | `services/*` | JSON-LD BreadcrumbList | → `https://www.parkinsandr.tech/services/` |
| `"item": ".../#portfolio"` | 6 | `projects/*` | JSON-LD BreadcrumbList | → `https://www.parkinsandr.tech/services/`, name «Портфоліо» → «Послуги» |
| `"@id": "https://www.parkinsandr.tech/#business"` | 4 | `index.html:47`, `services/kyiv:28,61`, `services/redesign:32` | ідентифікатор власної сутності | **не чіпати** (стабільний) |
| `"@id": "https://www.ladomyr.kiev.ua/#business"` | 2 | `projects/ladomyr:36,66` | ідентифікатор сутності клієнта | **не чіпати ніколи** |
| `"item": ".../#blog"` | 12 | `blog/*` | JSON-LD BreadcrumbList | **не чіпати** (Ф2) |

- Поточна цілісність: усі `href` і фрагменти резолвляться (0 помилок), усі 107 JSON-LD блоків парсяться.
- Індексів `/services/`, `/projects/`, `/blog/` не існує; посилань на них теж немає.
- Внутрішні сторінки мають мінімальну навігацію: лого → `/` + «← На головну»; видимих breadcrumbs немає.
- Чат ходить у Cloudflare Worker `oleksandr-site.sashko1391.workers.dev` (код воркера не в репо). Після отримання
  контакту `sendToTelegram` (`index.html:2766`) шле `{contact, history, timestamp}` — **усю історію розмови**.

### Маніфест залежностей чату (`public/index.html`, рядки на 2026-09-18)
| Шар | Що переносимо |
|---|---|
| HTML | секція `#chat-section` від 2568: `.chat-container`, `.chat-header`, `#chatMessages`, `#quickBtns`, `#chatInput`, `.chat-send`, блок `.contact-alt` |
| CSS — спільні | `.container`, `.section-label` (+`::before`), `.section-title`, `.section-desc` (618–655) |
| CSS — контакти | `.contact-alt`, `.contact-pill` (+`:hover`) (1298–1320) |
| CSS — повідомлення | `@keyframes msg-in` (1415), `.msg-avatar` (1427), `.msg-bubble` (1449), `.typing` + `span:nth-child` (1468–1486), `@keyframes typing-bounce` (1490) |
| CSS — чат | `.chat-*`, `.quick-btn*` (у діапазоні ~1327–1956), мобільне правило `.chat-container` (~1956) |
| CSS/JS — reveal | `.reveal`/`.reveal.visible` (1795/1801) + observer (2626–2629) — **або прибрати клас `reveal`** (інакше чат невидимий) |
| JS | з блоку 2624–2898 вибірково: `CHAT_PROXY_URL`, `chatHistory`, `addMessage`, індикатор набору, `sendToTelegram`, `sendMessage`, `sendQuick`, `chatStarted` + події GA4 |
| Обробники | inline `onclick`/`onkeydown` (2593–2603) **замінити на `addEventListener`** — без глобальних функцій |
| Аналітика | `gtag` визначається inline-сніпетом GA4 (~2902) — на `/services/` той самий сніпет; чат викликає `gtag` лише на дії користувача |

## Кроки

### Крок 1 — Валідатор: цілісність + політика міграції
`scripts/check-links.mjs` (pure-функції + main-guard) + `scripts/link-policy.mjs` (маніфест) + `tests/links.test.js`.

**Шар A — цілісність (діє на всіх фазах):**
- кожен внутрішній `href` резолвиться у файл; **same-origin абсолютні URL** (`https://www.parkinsandr.tech/…`)
  вважаються внутрішніми, а не пропускаються як зовнішні;
- фрагмент дозволений, якщо на цільовій сторінці є такий `id`;
- кожен JSON-LD блок парситься; `canonical` = URL файла; sitemap містить кожен canonical indexable URL рівно один раз
  і нічого зайвого (sitemap — у `tests/policy.test.js`, див. «Реалізовано»).

**Шар B — політика міграції (маніфест по фазах):**
- дозволені legacy-фрагменти головної: до кроку 3 — `#chat-section`, `#scenarios`, `#portfolio`, `#blog`;
  після Ф1 — лише `#blog`; після Ф2 — жодного;
- точні очікування Ф1: 25 комерційних CTA → `/services/#chat`; 3 journal-посилання → особистий контакт;
  5 breadcrumb `services/*` і 6 `projects/*` → `/services/`;
- на всіх фазах: `@id https://www.parkinsandr.tech/#business` незмінний; `@id` Ladomyr незмінний;
- Ф2 (заготовка): явна таблиця «стаття блогу → хаб» (`/code/` або `/services/`), без правил «за замовчуванням».

Спершу прогін на поточному сайті: шар A — 0 помилок (підтверджено Codex); шар B — стан «до кроку 3».
**Тести:** table-driven unit (resolver, same-origin, фрагменти, canonical, маніфест) + integration по `public/`;
sitemap — у `tests/policy.test.js`.

**✅ Реалізовано (2026-09-18, v2 після рев'ю Codex):** `scripts/check-links.mjs` + `scripts/link-policy.mjs` (фази
`f1-pre` — поточна, `f1-done`) + `tests/links.test.js` (93 тести) + `npm run check:links [-- --phase f1-done]`.
На `public/`: 45 сторінок, 1399 same-origin посилань (238 з фрагментом) + 889 CSS `url()` (888 шрифтів, 1 data-URI) —
0 помилок у `f1-pre`; пробний прогін `f1-done` = рівно обсяг кроку 3 (зафіксовано інтеграційним тестом): 39 якорів
головної (28 CTA + 5 `#scenarios` + 6 `#portfolio`), 22 файли CTA, 2 файли «напишіть мені», 11 breadcrumbs.
Мутаційна перевірка: 38 мутантів — 22 у коді валідатора, 7 на реальних сторінках, 9 у маніфесті (зокрема всі
сценарії обох рев'ю) — усі ловляться тестами. Маніфест не може тихо послабити сам себе: інтеграційні тести незалежно
перевіряють покриття breadcrumbs (кожна сторінка `services/*`, `projects/*`, `blog/*` — рівно одне правило), повноту
`idCounts` (перелічено кожну сторінку, що посилається на `@id`) і цілі `f1-done` (літерали з цього плану — скрипт
кроку 3 братиме їх із маніфесту, тож помилка в цілі інакше «підтвердила» б сама себе). Уточнення відносно плану:
- **шар A ширший:** `href`/`src`/`srcset`/`poster`/`xlink:href`, CSS `url()` у `<style>` і `style=""`, абсолютний
  `<meta content>` (`og:image`), URL у JSON-LD (крім `@id` сутностей; `item.@id` breadcrumbs — посилання; `@graph`);
  помилки: неканонічний origin (non-www, http) і шлях (без слешу, `index.html`, percent-escape звичайних символів чи
  `%2F`), відносний URL у URL-властивостях JSON-LD, дублікати `id`, `<base>`, фрагмент на не-HTML файл (зовнішні
  SVG-спрайти не підтримуються — лише inline SVG). `srcset` розбирається за специфікацією (data-URL з комами). Не
  покрито: `<form action>`;
- **шар B — точні пофайлові маніфести**, а не глобальні лічильники (нова сторінка їх не ламає):
  R1 — 22 файли → **тексти** CTA (разом 25): CTA знаходиться за текстом (вкладені теги знімаються з урахуванням лапок,
  entity декодуються; невідома іменована entity лишається буквальною → видима помилка, не тихий пропуск), тож перевірка
  ловить і неправильну ціль, і зайве посилання з тим самим текстом; R2 — так само, 2 файли → 3 «напишіть мені»;
  breadcrumbs — у **кожному** BreadcrumbList рівно один position 2 (integer; `item` рядком або `{"@id"}`) для
  `services/*`, `projects/*` **і `blog/*`** (`/#blog` не чіпається до Ф2);
  `@id #business` — точна к-сть 1/2/1 на `index`/`kyiv`/`redesign`; `@id` Ладомира — рівно 2, лише в кейсі
  (`tests/policy.test.js`, бо правило постійне). Глобальні лічильники R1–R4 (25/3/5/6) звіряє ще й скрипт кроку 3;
- таблиця Ф2 «стаття блогу → хаб» — додається у Ф2.
- Рев'ю Codex (2026-09-18): 1 High (R1 шукав CTA за очікуваною ціллю — тавтологія) + 4 Medium (неточні інваріанти
  `/#blog` і `@id`; дублікати `id`; тести без snapshot; JSON-LD `item`-об'єкт/відносні URL/тип position) + 3 Low
  (CSS `url()`, `<base>`, percent-encoding, формулювання правила 12) — усі прийнято й виправлено.
- Рев'ю Codex, раунд 2 (2026-09-18): 1 Medium (маніфест міг послабити сам себе — breadcrumbs і `idCounts` не
  зафіксовані) + 4 Low (текст CTA з `>` у вкладеному тезі; position 2 сумарно, а не по кожному списку; `srcset` з
  data-URL; зовнішні SVG-спрайти; неточні формулювання) — прийнято й виправлено. Відхилено одне: повний декодер
  іменованих entity (~2 200 назв) — непропорційно для dev-валідатора; невідома entity дає видиму помилку, а не обхід.

### Крок 2 — Сторінка `/services/`
База: клон `public/services/nextjs/index.html` (design system, шрифти, аналітика inline) + залежності з маніфесту.
Порядок секцій за PAGE_STANDARD (кожен H2 — самодостатнє питання з назвою сутності, перший абзац 40–60 слів):

| # | Секція | id | Зміст |
|---|---|---|---|
| 0 | Header + **видимі breadcrumbs** | — | лого + «← На головну» + skip link; видимий шлях «Головна → Послуги» = BreadcrumbList |
| 1 | Hero | — | один H1; answer-first ~100–150 слів; primary CTA «Обговорити проєкт» → `#chat`; ghost → `/pricing/`; фото автора `/images/oleksandr.webp` (480×480, JPG-fallback) з описовим `alt`, `width/height`, `fetchpriority="high"` |
| 2 | Proof strip | — | рішення власника: «6+ запущених проєктів — від сайту-візитки до сайту з CRM»; назви 6 клієнтів → їхні кейси (ACE, AGENTIS, Atlas, Julia Satyr Art, Ладомир, Славутич); «юрист за освітою: договір, права на код і домен — ваші». Рейтинг AGENTIS у AI-відповідях — **не** в proof strip |
| 3 | Проблема | `problem` | «Чому сайт “як у всіх” не приводить клієнтів?» — 3–5 болів, 1 факт |
| 4 | Рішення / послуги | `services` | «Які послуги з розробки сайтів я надаю?» — 5 карток → 5 лендингів |
| 5 | Вигоди + **mid CTA** | `benefits` | 3–5 outcome-вигід з доказом + той самий primary CTA |
| 6 | Процес | `process` | «Як проходить робота над сайтом?» — «Є N кроків» + 3–5 нумерованих |
| 7 | Кейси | `cases` | «Які сайти я вже зробив і з якими результатами?» — 6 кейсів з реальними метриками |
| 8 | Ціни | `pricing` | «Скільки коштує розробка сайту?» — ≤3 пакети + `/pricing/` |
| 9 | Бібліотека | `library` | «Що прочитати перед замовленням сайту?» — 6 статей для замовників + 3 SEO/GEO-кейси |
| 10 | FAQ | `faq` | 5–7 унікальних питань (не дублюють FAQ лендингів), H3, 50–300 слів, видимі, FAQPage = видимий текст |
| 11 | Final CTA + чат | `chat` | той самий primary CTA; чат за маніфестом |
| 12 | Footer | — | як на інших сторінках (`/pro-mene/`, `/privacy/`, ©) |

**Чат на `/services/` — відмінності від головної:**
- обробники через `addEventListener`, класичний `<script>` (не module), без глобальних функцій;
- a11y: `#chatMessages` з `role="log"` + `aria-live="polite"`; усі кнопки `type="button"`; send і quick-кнопки
  ≥ 48×48 px; текст поля і повідомлень ≥ 16 px на мобільних; видимий `<label>` для поля;
- **розкриття біля поля:** «Коли ви залишите контакт, історію цієї розмови буде передано Олександрові в Telegram»
  + лінк на `/privacy/`;
- атрибуція: у payload `source: location.pathname`; якщо воркер ігнорує невідомі поля — дописати
  «Сторінка: /services/» на початок `history` (перевірити на тестовому ліді);
- події GA4 (`chat_start`, `chat_message`, `generate_lead`) — ті самі імена й параметри;
- ⚠️ тимчасовий дубль чату (головна + `/services/`) до Ф3 → до Ф3 будь-яку правку чату робити в обох місцях.

**CTA-трекінг:** трекінг із клону `nextjs` (`nextjs:646`) не бачить нових `href="#chat"` → кожен CTA позначається
`data-cta="<місце>"` (hero / benefits / final / library-…), один делегований слухач шле `cta_click` з `label`.

**Метадані й розмітка:**
- title ≤ 60: «Розробка сайтів: послуги, ціни, кейси | Олександр Кравченко» (59). Baseline: за комерційними
  запитами сайт не ранжується (позиції далеко за топ-30) → title/H1 не «полюють» на «скільки коштує сайт»,
  а чесно називають пропозицію; вага — на переконливість для прямих відвідувачів (кейси, докази, контакт);
- description 150–155 (формула seo_standard), self-canonical, OG/Twitter, RSS `<link>` (`inject-rss`), GA4 +
  Clarity + Plausible, один `<main>`, один H1, усі значущі зображення з описовим `alt`;
- JSON-LD: `CollectionPage` (`about` → `{"@id": "https://www.parkinsandr.tech/#business"}`), `ItemList` з 5 `Service`
  (`provider` → той самий `@id`, `url` → лендинг), `BreadcrumbList` (Головна → Послуги), `FAQPage`.
  ProfessionalService **лише посиланням через `@id`** — повний вузол лишається на головній до Ф3;
- `sitemap.xml`: + `/services/` (`lastmod` = дата публікації). IndexNow: `/services/`.

**Контракт сторінки — автотест** (`tests/services-page.test.js`, статичний парсинг HTML):
один H1 і один `<main>`; title ≤ 60; description 150–155; canonical; усі `<img>` з непорожнім `alt`;
id `services`, `cases`, `chat`, `faq` існують; 5–7 FAQ-питань і тексти FAQPage = видимі H3/відповіді;
кожен CTA має `data-cta`; присутні типи JSON-LD CollectionPage, ItemList, BreadcrumbList, FAQPage;
видимі breadcrumbs = BreadcrumbList.

**Браузерний smoke** (`scripts/smoke-services.mjs`, Playwright + системний Chrome, локальний статичний сервер;
Worker і `gtag` підмінені через route-mock/шпигуна; окремий `npm run smoke:services`, не в `npm test`):
чат видимий (не прихований `.reveal`); quick-кнопка надсилає повідомлення і дає `chat_start`; Enter надсилає;
є індикатор набору; контакт → `generate_lead` і payload з `source`; computed-розміри кнопок ≥ 48 px, шрифт ≥ 16 px
на мобільному viewport.

### Крок 3 — Перепривʼязка: `scripts/repoint-anchors.mjs`
Pure-функція + маніфест правил + main-guard + `--dry`; ідемпотентно; `public/index.html` пропускається.
**Тести пишемо до запуску на реальних файлах.**

| Правило | Умова | Ціль | Очікувана к-сть |
|---|---|---|---|
| R1 | `<a href="/#chat-section">` у `services/*`, `projects/*`, `blog/*`, `pro-mene` | `/services/#chat` | 25 |
| R2 | `<a href="/#chat-section">` з текстом «напишіть мені» — **лише за маніфестом**: `parkinson-shcho-robyty` ×1, `rannii-parkinsonizm` ×2 | `https://t.me/+380936429885` (`PERSONAL_CONTACT`; змінюється лише `href`, як і в R1) | 3 |
| R3 | BreadcrumbList → ListItem з `item` `…/#scenarios` | `…/services/` | 5 |
| R4 | BreadcrumbList → ListItem з `item` `…/#portfolio` і `name` «Портфоліо» | `item` → `…/services/`, `name` → «Послуги» | 6 |
| — | `@id #business` (власний і Ladomyr), `item …/#blog` | не чіпати | 4 + 2 / 12 |

Запобіжники:
- **HTML:** зміни лише в атрибуті `href` тегу `<a>` (будь-які лапки й порядок атрибутів); не в тексті, `<script>`,
  JSON-LD-рядках, `data-*`;
- **JSON-LD структурно:** блок парситься й обходиться за `@type` (BreadcrumbList → ListItem); зміна робиться точковою
  заміною рядка, після чого повторний парсинг підтверджує, що змінились **рівно** очікувані поля очікуваних
  ListItem, і нічого більше (семантичний diff до/після);
- **R2 тільки за маніфестом:** будь-яке інше `/#chat-section` у `journal/*` → помилка, не тиха заміна;
- **Спочатку обчислити все, потім писати:** зміни всіх файлів готуються в пам'яті, перевіряються (точні лічильники
  R1–R4, незмінність `@id`, валідатор шарів A+B) — і лише тоді записуються всі разом; будь-яка помилка → не
  записується жоден файл.

**Тести:** unit по кожному правилу; точні лічильники; ідемпотентність (другий прогін = 0 змін); винятки `#business`
(обидва домени) і `#blog`; пропуск головної; CRLF. **Негативні:** `/#chat-section` у тексті, у `<script>`, у JSON-LD,
у `data-*`; single quotes; змінений порядок атрибутів (має спрацювати, бо це справжній `href`). Integration: після
прогону валідатор (шари A+B, стан «після Ф1») — 0 помилок.

### Крок 4 — Перевірка перед пушем
- `npm test` (старі + валідатор + контракт сторінки + скрипт) зелені; `npm run smoke:services` зелений.
- Візуально локально (`python3 -m http.server -d public`): desktop/mobile.
- `git diff public/index.html` порожній.
- Рев'ю діфа (Codex).

### Крок 5 — Деплой і смоук на проді
- push → Vercel READY; `/services/` 200, canonical, JSON-LD валідний, є в sitemap.
- 3–5 змінених сторінок: CTA ведуть на `/services/#chat`; пости про Паркінсон — на особистий контакт.
- Чат на `/services/`: AI відповідає (воркер приймає запити з цієї сторінки); тестовий лід із контактом
  доходить у Telegram з позначкою сторінки (позначити як тест).
- GA4 Realtime: `page_view` `/services/`, `chat_start` з `page_location=/services/`.
- Rich Results Test (FAQPage, BreadcrumbList), PSI mobile `/services/` (LCP ≤ 2.5 s, CLS < 0.1).
- IndexNow `/services/`; GSC → URL Inspection → «Запросити індексування» для `/services/` і 4 лендингів,
  що за 7 місяців не мали жодного показу (`kyiv`, `redesign`, `nextjs`, `landing`).

### Крок 6 — Функціональні перевірки після запуску (без вікна очікування)
- Логи Vercel: нових 404 немає; кілька змінених сторінок на проді — CTA ведуть куди треба.
- `chat_start` / `generate_lead` з `page_location=/services/` з'являються в GA4 — як факт роботи, не статистика.
- Щось зламалось → матриця відкату.

## Матриця відкату
| Проблема | Дія |
|---|---|
| Зламані CTA або чат на `/services/` | revert **лише коміту кроку 3** → CTA знову на `/#chat-section` (чат на головній живий увесь час) |
| Проблема з хабом (верстка/контент) | виправлення вперед; якщо терміново — revert кроку 3, хаб лишається доступним (200) |
| Хаб треба прибрати повністю | 404/410 або тимчасовий `noindex` — **не лише** видалення із sitemap (воно не деіндексує) |

## Коміти (один логічний change на коміт)
1. `test(links): integrity validator + migration policy manifest`
2. `feat(services): /services/ commercial hub + page contract test + sitemap`
3. `test(e2e): browser smoke for the /services/ chat`
4. `feat(links): repoint homepage anchors to /services/` (скрипт + тести + застосовані зміни)
5. `docs: Ф1 статус`

## Definition of Done
- [ ] `/services/` live, валідна розмітка, у sitemap; `/services/` і 4 лендинги подані на індексацію
- [ ] 25 комерційних CTA → `/services/#chat`; 3 «напишіть мені» → особистий контакт; 11 breadcrumb items → `/services/`
- [ ] Обидва `@id #business` (власний і Ladomyr) і `/#blog` не змінені
- [ ] Валідатор (шари A+B) і контракт сторінки в тестах — зелені; smoke чату — зелений
- [ ] Чат на `/services/`: a11y-вимоги виконані, розкриття передачі історії є, тестовий лід дійшов із позначкою сторінки
- [ ] `git diff public/index.html` порожній

## Залежності
- ✅ **Ф0 baseline** знято 2026-09-18 (`doc/baseline/`, локально). Порогу лідів немає (обсяги замалі);
  підхід до title — див. «Метадані». Блокерів для старту Ф1 немає.

## Відкриті питання — рішення власника (2026-09-18)
1. ✅ «Напишіть мені» в постах про Паркінсон → Telegram `https://t.me/+380936429885` (у `link-policy.mjs` —
   `PERSONAL_CONTACT`; той самий контакт уже стоїть у пості пам'яті Максима Бабака й на `/pro-mene/`).
2. ✅ Hero — фото автора.
3. ✅ Proof strip — «6+ проєктів», назви клієнтів, «юрист за освітою» (без рейтингу AGENTIS).
4. ⏳ FAQ `/services/` — чернетку 5–7 питань (лише правдиві факти) власник затверджує разом зі сторінкою на кроці 2.
5. ✅ Головна в Ф1 — без змін (посилання на `/services/` з'явиться в Ф3).

✅ Закрито рев'ю: breadcrumbs кейсів «Головна → Послуги → Кейс» коректні, бо `/services/` видимо містить усі 6 кейсів.
