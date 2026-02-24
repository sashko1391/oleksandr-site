# Oleksandr Kravchenko — Portfolio Site

## Структура

```
├── index.html                            ← Головна сторінка
├── blog/
│   ├── yak-obrati-rozrobnyka/index.html  ← Стаття: Як обрати розробника
│   └── react-vs-tilda/index.html         ← Стаття: React vs Tilda
├── projects/
│   └── agentis/index.html                ← Кейс: AGENTIS
├── public/images/                        ← Скріншоти проєктів (jpg)
├── sitemap.xml                           ← Карта сайту для Google
├── robots.txt                            ← Правила індексації
├── deploy.sh                             ← Скрипт деплою
├── vercel.json
└── package.json
```

## Архітектура чату

```
Користувач на сайті
  → POST → Cloudflare Worker (oleksandr-site.sashko1391.workers.dev)
    → Telegram Bot API → повідомлення в Telegram
```

Токен бота зберігається в секретах Cloudflare Worker, не у фронтенді.
При мережевій помилці або HTTP 4xx/5xx — запит зберігається в localStorage
і повторюється при наступному завантаженні сторінки.

## Деплой

```bash
./deploy.sh "опис змін"
```

## Cloudflare Worker

Секрети (Workers → Settings → Variables and Secrets):
- `TELEGRAM_BOT_TOKEN` — токен від @BotFather
- `TELEGRAM_CHAT_ID` — твій chat_id

## Домен

Vercel → Settings → Domains → `parkinsandr.tech`
