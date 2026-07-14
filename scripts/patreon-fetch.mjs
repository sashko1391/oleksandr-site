#!/usr/bin/env node
// Fetch one Patreon post (owner's own content) using the saved session,
// and export it to ~/patreon_posts/ as <title>.md + images/post_<id>_inline_N.jpg
// — the same format the build converters expect.
// Run:  node scripts/patreon-fetch.mjs <post-url>
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const AUTH = 'patreon-auth.json';
const url = process.argv[2];
if (!url) { console.error('Usage: node scripts/patreon-fetch.mjs <post-url>'); process.exit(1); }
if (!existsSync(AUTH)) { console.error('Немає', AUTH, '— спершу: node scripts/patreon-login.mjs'); process.exit(1); }

const id = (url.match(/posts\/[^/]*?-(\d+)/) || url.match(/(\d+)/) || [])[1];
if (!id) { console.error('Не знайшов post id у URL'); process.exit(1); }

const OUT_DIR = join(homedir(), 'patreon_posts');
const IMG_DIR = join(OUT_DIR, 'images');
mkdirSync(IMG_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ storageState: AUTH });

// 1) Try the JSON API (cleanest: gives content HTML + title)
let title = null, content = null, published = null;
const api = `https://www.patreon.com/api/posts/${id}?fields[post]=title,content,published_at&json-api-use-default-includes=false`;
try {
  const r = await context.request.get(api, { headers: { accept: 'application/json' } });
  if (r.ok()) {
    const j = await r.json();
    title = j?.data?.attributes?.title || null;
    content = j?.data?.attributes?.content || null;
    published = (j?.data?.attributes?.published_at || '').slice(0, 10) || null;
  }
} catch {}

// 2) Fallback: render the page and read the post-content container
if (!content) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  title = title || (await page.evaluate(() => document.querySelector('meta[property="og:title"]')?.content || document.title));
  content = await page.$eval('[data-tag="post-content"]', (el) => el.innerHTML).catch(() => null);
  if (!content) { console.error('Не вдалось дістати контент поста (ні API, ні DOM).'); await browser.close(); process.exit(2); }
}

// 3) Walk the content HTML into ordered blocks (in a scratch page)
const page = await context.newPage();
await page.setContent(`<article id="c">${content}</article>`);
const blocks = await page.evaluate(() => {
  const root = document.getElementById('c');
  const out = [];
  const inlineMd = (node) => {
    let s = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') s += '\n';
        else if (tag === 'strong' || tag === 'b') s += '**' + inlineMd(n) + '**';
        else if (tag === 'em' || tag === 'i') s += '*' + inlineMd(n) + '*';
        else if (tag === 'a') s += '[' + inlineMd(n) + '](' + (n.getAttribute('href') || '') + ')';
        else if (tag === 'img') out.push({ t: 'img', v: n.currentSrc || n.src || n.getAttribute('src') });
        else s += inlineMd(n);
      }
    });
    return s;
  };
  const walk = (el) => {
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push({ t: 'p', v: t }); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (tag === 'img') { out.push({ t: 'img', v: n.currentSrc || n.src || n.getAttribute('src') }); return; }
      if (/^h[1-6]$/.test(tag)) { out.push({ t: 'h', v: n.textContent.trim() }); return; }
      if (tag === 'ul' || tag === 'ol') { n.querySelectorAll(':scope>li').forEach((li) => out.push({ t: 'li', v: inlineMd(li).trim() })); return; }
      if (tag === 'p' || tag === 'div' || tag === 'blockquote') {
        // collect direct imgs first if any are block-level
        const imgs = n.querySelectorAll(':scope>img, :scope>figure img');
        const md = inlineMd(n).trim();
        if (md) out.push({ t: 'p', v: md });
        return;
      }
      // unknown container: recurse
      walk(n);
    });
  };
  walk(root);
  return out;
});

// 4) Download images, build markdown
let imgN = 0;
const lines = [`# ${title || 'Без назви'}`, '', `**Посилання на Patreon:** [${url}](${url})`, ''];
if (published) { lines.push(`**Дата публікації:** ${published}`, ''); }
lines.push('---', '');
for (const b of blocks) {
  if (b.t === 'img' && b.v) {
    imgN++;
    const file = `post_${id}_inline_${imgN}.jpg`;
    try {
      const res = await context.request.get(b.v);
      if (res.ok()) {
        const buf = await res.body();
        writeFileSync(join(IMG_DIR, file), buf);
        lines.push(`![Image](images/${file})`, '');
      }
    } catch (e) { console.error('img fail', b.v, String(e)); }
  } else if (b.t === 'h') lines.push(`### ${b.v}`, '');
  else if (b.t === 'li') lines.push(`* ${b.v}`);
  else if (b.t === 'p' && b.v) lines.push(b.v, '');
}

const safe = (title || `post-${id}`).replace(/[\/\\:*?"<>|]/g, '_').slice(0, 120);
const mdPath = join(OUT_DIR, `${safe}.md`);
writeFileSync(mdPath, lines.join('\n'), 'utf-8');
console.log(`✅ ${mdPath}`);
console.log(`   ${imgN} фото → ${IMG_DIR}/post_${id}_inline_*.jpg`);
await browser.close();
