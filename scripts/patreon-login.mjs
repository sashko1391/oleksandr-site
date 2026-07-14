#!/usr/bin/env node
// One-time Patreon login: opens a real browser, you log in manually,
// then your session is saved to patreon-auth.json (gitignored).
// Run:  node scripts/patreon-login.mjs
import { chromium } from 'playwright';

const AUTH = 'patreon-auth.json';

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://www.patreon.com/login', { waitUntil: 'domcontentloaded' });

console.log('\n>>> Увійди в Patreon у вікні браузера, що відкрилось.');
console.log('>>> Щойно ти залогінишся — скрипт сам це помітить і збереже сесію.\n');

const deadline = Date.now() + 8 * 60 * 1000; // 8 min
let ok = false;
while (Date.now() < deadline) {
  try {
    const res = await context.request.get('https://www.patreon.com/api/current_user', {
      headers: { accept: 'application/json' },
    });
    if (res.ok()) {
      const j = await res.json().catch(() => null);
      if (j && j.data && j.data.id) {
        console.log('✅ Залогінено як user id', j.data.id);
        ok = true;
        break;
      }
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 4000));
}

if (ok) {
  await context.storageState({ path: AUTH });
  console.log('✅ Сесію збережено у', AUTH);
} else {
  console.log('⏱️  Не дочекався логіну (8 хв). Запусти скрипт ще раз.');
}
await browser.close();
process.exit(ok ? 0 : 1);
