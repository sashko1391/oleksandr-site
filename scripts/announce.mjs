#!/usr/bin/env node
// Announce a published post: regenerate the feeds, then post it to the Telegram channel.
// Ф4 of doc/PERSONAL_SITE_PLAN.md — the email fan-out of doc/SUBSCRIPTION_PLAN.md Фаза 2 comes later.
//
//   node scripts/announce.mjs journal/hoverla            # feeds + channel post
//   node scripts/announce.mjs journal/hoverla --dry      # print the post, send nothing, touch nothing
//   node scripts/announce.mjs journal/hoverla --only=tg  # skip the feeds
//   node scripts/announce.mjs journal/hoverla --force    # post again although it is already marked sent
//
// Secrets come from the environment or a gitignored .env: TELEGRAM_BOT_TOKEN (same bot as the comment
// notifications) and TELEGRAM_CHANNEL_ID (@username of the public channel). Nothing is written to the repo:
// what has already been announced is kept in .announce-state.json, which is gitignored.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parsePost, writeFeeds } from './build-feed.mjs';
import { primaryHub, HUB_MEMBERS } from './link-policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const STATE = join(ROOT, '.announce-state.json');

/** Accept `journal/hoverla`, `/journal/hoverla/`, `public/journal/hoverla/index.html` or the full URL. */
export function normalizeSlug(input) {
  const path = String(input)
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/?public\//, '')
    .replace(/index\.html$/, '')
    .replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(path)) throw new Error(`not a post slug: ${input}`);
  return path;
}

/**
 * The channel hashtag of a post: the hub that owns it (HUB_MEMBERS.primary), not articleSection —
 * only 12 of 28 posts carry a section, and the ones that do disagree with each other.
 */
export function hashtagFor(slug) {
  const owner = primaryHub().get(`${slug}/index.html`);
  const name = owner?.name ?? HUB_MEMBERS['blog/'].name;
  return `#${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_')}`;
}

/** Escape the three characters Telegram's HTML parse mode reserves. */
export const tgEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The channel post: bold headline, the post's own teaser, the link (its preview card), one hashtag. */
export function composePost(item, slug) {
  const teaser = item.description ? `\n\n${tgEscape(item.description)}` : '';
  return `<b>${tgEscape(item.title)}</b>${teaser}\n\n${item.link}\n\n${hashtagFor(slug)}`;
}

export const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
export const markSent = (state, slug, channel) =>
  ({ ...state, [slug]: { ...state[slug], [channel]: new Date().toISOString() } });

/** Load a gitignored .env without a dependency; never overrides what is already in the environment. */
function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

/** Read one post, or explain what is missing. */
export function readItem(slug) {
  const file = join(PUBLIC, slug, 'index.html');
  if (!existsSync(file)) throw new Error(`no such post: public/${slug}/index.html`);
  const item = parsePost(readFileSync(file, 'utf8'), '', `${slug}/index.html`);
  if (!item) throw new Error(`${slug}: the post has no valid datePublished or canonical`);
  return item;
}

async function main(argv) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const [slugArg] = argv.filter((a) => !a.startsWith('--'));
  if (!slugArg) throw new Error('usage: announce.mjs <section/slug> [--dry] [--only=tg|feed] [--force]');
  const dry = flags.includes('--dry');
  const force = flags.includes('--force');
  const only = flags.find((f) => f.startsWith('--only='))?.slice('--only='.length);
  if (only && !['tg', 'feed'].includes(only)) throw new Error(`--only must be tg or feed, got ${only}`);

  const slug = normalizeSlug(slugArg);
  const item = readItem(slug);
  const text = composePost(item, slug);

  if (only !== 'tg') {
    if (dry) console.log('— feeds: would regenerate (skipped by --dry)');
    else for (const { feed, count } of writeFeeds()) console.log(`— ${feed.file}: ${count} items`);
  }

  if (only === 'feed') return;

  const state = readState();
  if (state[slug]?.tg && !force) {
    console.log(`— telegram: already posted ${state[slug].tg} — use --force to post again`);
    return;
  }
  if (dry) {
    console.log(`— telegram: would post to ${process.env.TELEGRAM_CHANNEL_ID ?? '(TELEGRAM_CHANNEL_ID unset)'}:\n`);
    console.log(text);
    return;
  }
  for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID']) {
    if (!process.env[key]) throw new Error(`${key} is not set — put it in the gitignored .env`);
  }
  const { sendToChannel } = await import('../lib/telegram.js');
  const res = await sendToChannel(text);
  writeFileSync(STATE, JSON.stringify(markSent(state, slug, 'tg'), null, 2), 'utf8');
  console.log(`— telegram: posted, message_id ${res?.result?.message_id ?? '?'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv();
  main(process.argv.slice(2)).catch((e) => {
    console.error(`announce: ${e.message}`);
    process.exit(1);
  });
}
