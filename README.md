# parkinsandr.tech — особистий сайт Олександра Кравченка

Автор і розробник: щоденник, програмування, творчість, життя з хворобою Паркінсона; окремо — розробка сайтів на замовлення.
Сайт у процесі переробки з сайту послуг в особистий — див. [`doc/PERSONAL_SITE_PLAN.md`](doc/PERSONAL_SITE_PLAN.md).

## Стек
- Статичний HTML/CSS без build step (`public/`), хостинг Vercel.
- Vercel Functions (`api/`, `lib/`): коментарі — Supabase Postgres, Upstash KV, Cloudflare Turnstile, премодерація в Telegram.
- RSS: `public/feed.xml` — генерується скриптом із метаданих постів.

## AI-чат і лід-форми
```
Відвідувач → POST → Cloudflare Worker (oleksandr-site.sashko1391.workers.dev) → Telegram Bot API
```
Токен бота — у секретах воркера (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), не у фронтенді. При мережевій помилці
або HTTP 4xx/5xx запит зберігається в `localStorage` і повторюється при наступному завантаженні сторінки.

## Структура
```
public/   сторінки, зображення, шрифти, feed.xml, sitemap.xml
api/      Vercel Functions (коментарі, Telegram-вебхук, cron)
lib/      спільні модулі бекенду
scripts/  генератори й утиліти (RSS, інʼєкції, IndexNow, імпорт із Patreon)
tests/    vitest
doc/      плани, журнали, контекст
```

## Команди
```bash
npm install
npm test                              # vitest
node scripts/build-feed.mjs           # регенерувати public/feed.xml
node scripts/inject-rss.mjs           # RSS <link> у <head> усіх сторінок (ідемпотентно)
node scripts/inject-comments.mjs      # блок коментарів у journal + blog (ідемпотентно)
scripts/indexnow.sh /journal/slug/    # IndexNow для конкретних шляхів
```

## Деплой
`git push` у `main` → Vercel збирає автоматично. Змінні середовища — у Vercel; після їх зміни потрібен редеплой.

## Документація
- [`CLAUDE.md`](CLAUDE.md) — правила проєкту, структура, конвенції, чек-лист нового поста.
- [`doc/`](doc/) — плани (`PERSONAL_SITE_PLAN`, `SERVICES_HUB_PLAN`, `SUBSCRIPTION_PLAN`), `DEVELOPMENT_LOG`, `PROJECT_CONTEXT`.
