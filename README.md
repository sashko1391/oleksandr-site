# Oleksandr Kravchenko — Portfolio Site

## Структура

```
├── index.html          ← Сайт (статичний HTML)
├── api/
│   └── send-chat.js    ← Serverless function (проксі → Telegram)
├── vercel.json         ← Конфіг Vercel
├── package.json
└── .gitignore
```

---

## Деплой на Vercel (3 кроки)

### Крок 1: Створити GitHub-репо і запушити

```bash
cd oleksandr-site
git init
git add .
git commit -m "Initial commit"
```

На GitHub → New Repository → `oleksandr-site` → Create

```bash
git remote add origin https://github.com/sashko1391/oleksandr-site.git
git branch -M main
git push -u origin main
```

### Крок 2: Підключити до Vercel

1. Зайди на https://vercel.com → Sign up with GitHub
2. Натисни **"Add New Project"**
3. Вибери репо **oleksandr-site** → Import
4. Framework Preset: **Other** (або залиш як є)
5. Натисни **Deploy** — сайт буде живий за хвилину!

Vercel дасть URL типу: `https://oleksandr-site.vercel.app`

### Крок 3: Додати секрети для Telegram-бота

1. В дашборді Vercel → твій проект → **Settings** → **Environment Variables**
2. Додай:

| Name                 | Value                      |
| -------------------- | -------------------------- |
| `TELEGRAM_BOT_TOKEN` | Токен від @BotFather       |
| `TELEGRAM_CHAT_ID`   | Твій chat_id (число)       |

3. Натисни **Save**
4. Зайди в **Deployments** → три крапки біля останнього → **Redeploy**

---

## Як отримати Telegram Bot Token і Chat ID

### Bot Token:
1. Telegram → @BotFather → `/newbot`
2. Назва: `Сайт Олександра Бот`
3. Username: `sashko_site_bot`
4. Скопіюй токен: `7123456789:AAH...`

### Chat ID:
1. Напиши боту "привіт"
2. Відкрий в браузері:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Знайди `"chat":{"id":123456789}` — це твій ID

---

## Підключити свій домен (опціонально)

1. Vercel → проект → **Settings** → **Domains**
2. Додай домен, наприклад: `oleksandr-kravchenko.dev`
3. Vercel покаже DNS-записи — додай їх у свого реєстратора
4. Готово — HTTPS автоматично!

---

## Локальний запуск для тестування

```bash
npx vercel dev
```

Відкрий http://localhost:3000

Для тестування Telegram-бота локально створи `.env.local`:
```
TELEGRAM_BOT_TOKEN=твій_токен
TELEGRAM_CHAT_ID=твій_chat_id
```
