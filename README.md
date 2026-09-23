# parkinsandr.tech — особистий сайт Олександра Кравченка

Автор і розробник: щоденник, програмування, творчість, життя з хворобою Паркінсона; окремо — розробка сайтів на замовлення.
Переробка з сайту послуг в особистий: фази Ф0–Ф4 виконані, далі Ф5 (⛔ заблоковано) і Ф6 —
див. [`doc/PERSONAL_SITE_PLAN.md`](doc/PERSONAL_SITE_PLAN.md).

## Стек
- Статичний HTML/CSS без build step (`public/`), хостинг Vercel.
- Vercel Functions (`api/`, `lib/`): коментарі й підписка — Supabase Postgres, Upstash KV, Cloudflare Turnstile,
  премодерація в Telegram, листи через Resend; два cron-джоби чистять дані за строками.
- Три канали підписки: RSS (`public/feed.xml` — увесь сайт, плюс фід кожного розділу `/parkinson/`, `/code/`,
  `/creative/`, `/journal/`), Telegram-канал [@parkinsandr](https://t.me/parkinsandr) і email
  (подвійне підтвердження, розсилка нових постів, one-click відписка).

## Чат-бот і форми заявок
```
Відвідувач → бот на `/services/` (готові відповіді в JS, без LLM) або форма (/services/, лендинги)
          → POST {contact, history, timestamp} → Cloudflare Worker (oleksandr-site.sashko1391.workers.dev) → Telegram Bot API
```
Токен бота — у секретах воркера (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), не у фронтенді. Бот на `/services/` при
мережевій помилці або HTTP 4xx/5xx зберігає заявку в `localStorage` і повторює при наступному завантаженні сторінки;
форма `/services/` показує помилку з прямими контактами і дозволяє повторити.

## Структура
```
public/   55 сторінок, зображення, аудіо, шрифти, 5 RSS-фідів, sitemap.xml (54 URL)
api/      Vercel Functions: коментарі, підписка (subscribe / confirm / unsubscribe), Telegram-вебхук, 2 cron
lib/      спільні модулі бекенду (db, kv, email, telegram, security, schema, http)
scripts/  генератори й утиліти (RSS, анонси, інʼєкції, валідатор посилань, IndexNow, Patreon)
db/       SQL-міграції Supabase (застосовані; файли — джерело правди схеми)
tests/    vitest — 26 файлів, 469 тестів
doc/      плани, журнали, контекст
```

## Команди
```bash
npm install
npm test                              # vitest
npm run check:links                   # валідатор посилань і політики фази (-- --phase f1-done — пробний прогін)
npm run smoke:forms                   # браузерний smoke всіх лід-форм (Playwright + системний Chrome)
node scripts/build-feed.mjs           # регенерувати feed.xml — загальний і по розділах
node scripts/inject-rss.mjs           # RSS <link> у <head> (загальний скрізь, фід розділу — на хабі й постах)
npm run announce -- journal/slug      # анонс: фіди + Telegram-канал + лист підписникам (--dry щоб подивитись)
node scripts/inject-comments.mjs      # блок коментарів у journal + blog (ідемпотентно)
scripts/indexnow.sh /journal/slug/    # IndexNow для конкретних шляхів
```

## Деплой
`git push` у `main` → Vercel збирає автоматично. Змінні середовища — у Vercel; після їх зміни потрібен редеплой.

## Документація
- [`AGENTS.md`](AGENTS.md) — правила проєкту для AI-агентів (source of truth): структура, конвенції, чек-лист нового поста.
  [`CLAUDE.md`](CLAUDE.md) — міст для Claude Code (імпортує `AGENTS.md`).
- [`doc/`](doc/) — плани (`PERSONAL_SITE_PLAN`, `SERVICES_HUB_PLAN`, `SUBSCRIPTION_PLAN`), `DEVELOPMENT_LOG`, `PROJECT_CONTEXT`.
