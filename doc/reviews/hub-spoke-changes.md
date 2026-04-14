# Hub & Spoke: план змін для кластерної перелінковки

## Проблеми (аудит)

| Сторінка | Вхідних посилань | Проблема |
|----------|-----------------|----------|
| /blog/internal-linking/ | 0 | СИРОТА — ніхто не посилається |
| /services/redesign/ | 1 | Майже сирота — тільки з internal-linking |
| /blog/devlog-business-empire-idle/ | 2 | Мало вхідних |
| /blog/devlog-empire-online/ | 2 | Мало вхідних |

Сервісні сторінки не мають cross-links між собою (крім redesign).

---

## Зміни (10 файлів)

### 1. /services/nextjs/index.html
**Додати перед `<h2>Часті питання</h2>` (рядок 504):**
```html
  <h2>Пов'язані послуги</h2>
  <ul>
    <li><a href="/services/landing/" style="color: var(--blue-mid);">Лендінг під рекламу</a> — одна сторінка під конкретний оффер, готово за 7 днів</li>
    <li><a href="/services/ai/" style="color: var(--blue-mid);">AI-інтеграції для сайту</a> — чат-бот, автоматизація заявок, AI-асистент</li>
    <li><a href="/services/redesign/" style="color: var(--blue-mid);">Редизайн і перезапуск</a> — міграція зі старої платформи без втрати SEO</li>
  </ul>
```

### 2. /services/landing/index.html
**Додати перед `<h2>Часті питання</h2>` (рядок 627):**
```html
  <h2>Пов'язані послуги</h2>
  <ul>
    <li><a href="/services/nextjs/" style="color: var(--blue-mid);">Бізнес-сайт на Next.js</a> — 5-10 сторінок з CMS, блогом та SEO</li>
    <li><a href="/services/ai/" style="color: var(--blue-mid);">AI-інтеграції для сайту</a> — чат-бот, автоматизація заявок</li>
    <li><a href="/services/redesign/" style="color: var(--blue-mid);">Редизайн і перезапуск</a> — міграція зі старої платформи без втрати SEO</li>
  </ul>
```

### 3. /services/ai/index.html
**Додати перед `<h2>Часті питання</h2>` (рядок 511):**
```html
  <h2>Пов'язані послуги</h2>
  <ul>
    <li><a href="/services/nextjs/" style="color: var(--blue-mid);">Бізнес-сайт на Next.js</a> — 5-10 сторінок з CMS, блогом та SEO</li>
    <li><a href="/services/landing/" style="color: var(--blue-mid);">Лендінг під рекламу</a> — одна сторінка під конкретний оффер за 7 днів</li>
    <li><a href="/services/redesign/" style="color: var(--blue-mid);">Редизайн і перезапуск</a> — міграція зі старої платформи без втрати SEO</li>
  </ul>
```

### 4. /blog/yak-obrati-rozrobnyka/index.html
**Додати в related-posts (після існуючих 4 посилань, перед `</div></section>`):**
```html
    <a href="/services/redesign/">
      <div class="rp-title">Редизайн сайту для бізнесу — перезапуск</div>
      <div class="rp-desc">Міграція без просадки SEO: швидкість, конверсія, сучасний дизайн.</div>
    </a>
```

### 5. /blog/jarvis-ai-assistant/index.html
**Додати в related-posts:**
```html
    <a href="/services/nextjs/">
      <div class="rp-title">Бізнес-сайт на Next.js</div>
      <div class="rp-desc">Розробка швидких сайтів з SEO, блогом та AI-інтеграціями.</div>
    </a>
```

### 6. /blog/react-vs-tilda/index.html
**Додати в related-posts (вже є 4, замінити або додати 5-й):**
```html
    <a href="/services/redesign/">
      <div class="rp-title">Редизайн сайту для бізнесу</div>
      <div class="rp-desc">Міграція з Tilda/WordPress без втрати SEO-позицій.</div>
    </a>
```

### 7. /blog/skilky-koshtuye-sajt/index.html
**Додати в related-posts:**
```html
    <a href="/blog/internal-linking/">
      <div class="rp-title">Внутрішня перелінковка: як побудувати кластерну структуру</div>
      <div class="rp-desc">Покрокова інструкція з Hub & Spoke моделлю та чеклистом.</div>
    </a>
```

### 8. /blog/devlog-business-empire-idle/index.html
**Додати в related-posts:**
```html
    <a href="/blog/internal-linking/">
      <div class="rp-title">Внутрішня перелінковка: як побудувати кластерну структуру</div>
      <div class="rp-desc">Hub & Spoke модель, 7 помилок і чеклист для публікації.</div>
    </a>
```

### 9. /blog/devlog-empire-online/index.html
**Додати в related-posts:**
```html
    <a href="/blog/internal-linking/">
      <div class="rp-title">Внутрішня перелінковка: як побудувати кластерну структуру</div>
      <div class="rp-desc">Hub & Spoke модель, 7 помилок і чеклист для публікації.</div>
    </a>
```

### 10. /projects/slavutych/index.html
**Додати в related-posts або контент:**
```html
    <a href="/services/redesign/">
      <div class="rp-title">Редизайн сайту для бізнесу</div>
      <div class="rp-desc">Міграція з конструктора на швидку платформу. Як зроблено для Славутича.</div>
    </a>
```

---

## Очікуваний результат після змін

| Сторінка | Вхідних до | Вхідних після |
|----------|-----------|---------------|
| /services/redesign/ | 1 | 7+ |
| /blog/internal-linking/ | 0 | 4+ |
| /services/nextjs/ | 9 | 10+ |
| /services/ai/ | 7 | 9+ |
| /services/landing/ | 6 | 8+ |

Всі 4 сервісні сторінки матимуть повні cross-links між собою.
Жодних сторінок-сиріт.

## Codex review

### 🔴 Critical Issues
- **Неправильний acceptance criterion для `/blog/internal-linking/`.** У плані для цієї сторінки заявлено `0 -> 4+`, але сам список змін додає посилання лише з трьох сторінок: `/blog/skilky-koshtuye-sajt/`, `/blog/devlog-business-empire-idle/`, `/blog/devlog-empire-online/`. Тобто після імплементації буде `3`, а не `4+`. У такому вигляді команда може коректно виконати всі 10 пунктів і все одно формально "не дійти" до очікуваного результату.

### 🟠 Important Improvements
- **Пункти 8-9 ламають topical relevance кластера.** Обидва devlog-матеріали зараз тематично зібрані навколо game/platform engineering, а не SEO. Додавати туди `/blog/internal-linking/` як related post виглядає штучно: користувач читає про SvelteKit/idle-game або MMO-архітектуру, а отримує SEO-туторіал. Це слабкий match за intent і суперечить логіці самого `/blog/internal-linking/`, де сказано, що spoke має лінкуватися на релевантні сторінки в тому ж кластері.
- **Пункт 10 занадто розмитий і семантично слабкий.** Формулювання "додати в related-posts або контент" не дає однозначної точки вставки. Крім того, `/projects/slavutych/` зараз не має блоку `related-posts`, а сам кейс не містить жодної згадки про редизайн, міграцію чи перехід з конструктора. Текст картки "Міграція з конструктора на швидку платформу. Як зроблено для Славутича." вигадує narrative, якого немає в кейсі, отже може просадити довіру.
- **План не закриває hub-spoke симетрично для нових spoke.** Якщо `/blog/internal-linking/` справді стає hub для devlog-ів або кейсу `/projects/slavutych/`, то хаб теж має явно посилатися на них. Інакше це не повний spoke-зв'язок, а просто спроба добити inbound count.

### 🟡 Optional Improvements
- **Пункт 6 варто конкретизувати.** "Замінити або додати 5-й" залишає простір для двох різних реалізацій і двох різних фінальних DOM-структур. Для review-плану краще одразу зафіксувати один варіант.
- **Інструкції вставки місцями надто механічні.** Наприклад, "перед `</div></section>`" краще замінити на стабільніший орієнтир по секції або заголовку, щоб зменшити шанс кривої ручної правки.

### ⚠️ Risks
- Якщо імплементувати план буквально, сайт отримає більше внутрішніх посилань, але не обов'язково кращу інформаційну архітектуру: частина нових зв'язків виглядатиме як SEO-натягування, а не природна навігація.
- Для `/projects/slavutych/` є ризик візуально чужорідного блоку або просто одиночного посилання без контейнера і стилів.

### ✅ What is Good
- Пункти 1-3 сильні: cross-links між `/services/nextjs/`, `/services/landing/`, `/services/ai/`, `/services/redesign/` логічні, комерційно близькі і повторюють уже існуючий патерн на сторінці redesign.
- Пункти 4 і 6 теж виглядають доречно: статті `/blog/yak-obrati-rozrobnyka/` і `/blog/react-vs-tilda/` мають природний перехід у `/services/redesign/`.
- Базовий аудит сиріт корисний: проблема з нульовими вхідними на `/blog/internal-linking/` реальна, її точно треба закривати.

### 🧠 Verdict
- Поки що не production-ready як план імплементації. Блокери: неправильний expected result для `/blog/internal-linking/`, слабко релевантні лінки з devlog-ів і розмитий/семантично сумнівний пункт 10 для `/projects/slavutych/`.
