#!/usr/bin/env node
// Announce a published post: regenerate the feeds, then post it to the Telegram channel.
// Ф4 of doc/PERSONAL_SITE_PLAN.md — the email fan-out of doc/SUBSCRIPTION_PLAN.md Фаза 2 comes later.
//
//   node scripts/announce.mjs journal/hoverla            # feeds + channel post
//   node scripts/announce.mjs journal/hoverla --dry      # print the post, send nothing, touch nothing
//   node scripts/announce.mjs journal/hoverla --only=tg  # skip the feeds (tg|feed|email)
//   node scripts/announce.mjs journal/hoverla --only=email --dry   # who would get the letter
//   node scripts/announce.mjs journal/hoverla --force    # post again although it is already marked sent
//   node scripts/announce.mjs journal/hoverla --note "З архіву."   # one line of context above the title
//
// Secrets come from the environment or a gitignored .env: TELEGRAM_BOT_TOKEN (same bot as the comment
// notifications) and TELEGRAM_CHANNEL_ID (@username of the public channel). Nothing is written to the repo:
// what has already been announced is kept in .announce-state.json, which is gitignored.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parsePost, writeFeeds, FEEDS } from './build-feed.mjs';
import { primaryHub, HUB_MEMBERS, SITE } from './link-policy.mjs';
import { tgEscape, hashToken, unsubToken } from '../lib/security.js';

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
/** The subscribable section of a post, or null when its hub has no mailing list (/services/, /blog/). */
export function sectionOf(slug) {
  const owner = primaryHub().get(`${slug}/index.html`);
  if (!owner) return null;
  const topic = owner.hub.replace(/\/$/, '');
  const hasFeed = FEEDS.slice(1).some((f) => f.file === `${topic}/feed.xml`);
  return hasFeed ? { topic, name: owner.name } : null;
}

export function hashtagFor(slug) {
  const owner = primaryHub().get(`${slug}/index.html`);
  const name = owner?.name ?? HUB_MEMBERS['blog/'].name;
  return `#${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_')}`;
}

export { tgEscape }; // the site's own helper, so the escaping rule has one definition

/**
 * The channel post: an optional line of context (for an older post, so it does not read as new), the
 * bold headline, the post's own teaser, the bare link (Telegram turns it into the OG card), one hashtag.
 */
export function composePost(item, slug, note = '') {
  const lead = note.trim() ? `${tgEscape(note.trim())}\n\n` : '';
  const teaser = item.description ? `\n\n${tgEscape(item.description)}` : '';
  return `${lead}<b>${tgEscape(item.title)}</b>${teaser}\n\n${item.link}\n\n${hashtagFor(slug)}`;
}

export const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
export const markSent = (state, slug, channel, value = new Date().toISOString()) =>
  ({ ...state, [slug]: { ...state[slug], [channel]: value } });

/**
 * Should this slug go to the channel? Kept pure so the rule is testable: `main()` only obeys it.
 * @returns {{ post: boolean, reason: string }}
 */
export function postDecision(state, slug, force) {
  const when = state?.[slug]?.tg;
  if (!when || force) return { post: true, reason: force && when ? 'forced' : 'not posted yet' };
  if (when === 'sending') {
    return { post: false, reason: 'a previous run stopped mid-send — check the channel, then use --force' };
  }
  return { post: false, reason: `already posted ${when} — use --force to post again` };
}

/** Write the state through a temp file: a crash mid-write must not leave unreadable JSON. */
export function saveState(state) {
  const tmp = `${STATE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, STATE);
}

/**
 * Fail before the network call, with a message that names the problem. A half-copied bot token (the part
 * after the colon, which is what a password manager often hands back) makes Telegram answer a bare 404,
 * and nothing in that answer says the token is malformed. Values are never logged.
 */
export function assertEnv(env = process.env) {
  for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID']) {
    if (!env[key]) throw new Error(`${key} is not set — put it in the gitignored .env`);
  }
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN)) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is not a whole bot token: it must be «<цифри>:<решта>» — ' +
        'числовий id бота й двокрапка теж частина токена'
    );
  }
  if (!/^(@[A-Za-z]\w{3,}|-100\d+)$/.test(env.TELEGRAM_CHANNEL_ID)) {
    throw new Error('TELEGRAM_CHANNEL_ID must be @username or a -100… numeric id');
  }
}

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
  // Only a page the hub manifest owns is a post: /pro-mene/ or a landing must not be announced as one.
  if (!primaryHub().has(`${slug}/index.html`)) {
    throw new Error(`${slug} is not in HUB_MEMBERS — add it there first, it has no section and no hashtag`);
  }
  const item = parsePost(readFileSync(file, 'utf8'), '', `${slug}/index.html`);
  if (!item) throw new Error(`${slug}: the post has no valid datePublished or canonical`);
  return item;
}

const USAGE =
  'usage: announce.mjs <section/slug> [--dry] [--only=tg|feed|email] [--force] [--note "…"]';

/**
 * Parse the command line. `--note` takes its value either attached (`--note=…`) or as the next argument,
 * and that next argument must not be mistaken for the slug — the bug this function exists to keep fixed.
 */
const KNOWN_FLAGS = ['--dry', '--force', '--note', '--only'];

export function parseArgs(argv) {
  const flags = argv.filter((a) => a.startsWith('--'));
  // A typo must stop the run, not post for real: `--drry` used to be silently ignored.
  const unknown = flags.filter((f) => !KNOWN_FLAGS.includes(f.split('=')[0]));
  if (unknown.length) throw new Error(`unknown flag(s): ${unknown.join(', ')}\n${USAGE}`);
  const seen = flags.map((f) => f.split('=')[0]);
  const dupes = seen.filter((f, i) => seen.indexOf(f) !== i);
  if (dupes.length) throw new Error(`repeated flag(s): ${[...new Set(dupes)].join(', ')}`);
  const noteAt = argv.indexOf('--note');
  const noteValueAt = noteAt === -1 ? -1 : noteAt + 1; // -1 means "no argument is the note's value"
  const positional = argv.filter((a, i) => !a.startsWith('--') && i !== noteValueAt);
  if (positional.length > 1) throw new Error(`expected one slug, got: ${positional.join(', ')}`);
  const [slugArg] = positional;
  if (!slugArg) throw new Error(USAGE);
  const only = flags.find((f) => f.startsWith('--only='))?.slice('--only='.length);
  if (only && !['tg', 'feed', 'email'].includes(only)) {
    throw new Error(`--only must be tg, feed or email, got ${only}`);
  }
  const attached = flags.find((f) => f.startsWith('--note='));
  const note = attached ? attached.slice('--note='.length) : noteAt === -1 ? '' : (argv[noteValueAt] ?? '');
  if ((attached || noteAt !== -1) && !note.trim()) throw new Error('--note needs a non-empty line');
  return { slug: normalizeSlug(slugArg), dry: flags.includes('--dry'), force: flags.includes('--force'), only, note };
}

const EMAIL_PER_RUN = 90; // Resend free tier allows 100 letters a day; leave room for confirmations
const EMAIL_PACE_MS = 600; // …and ~2 requests a second

/**
 * Send one post to the confirmed subscribers of its section. Per recipient: claim the row BEFORE the
 * network call, send with a deterministic Idempotency-Key, then record the result. A crash between
 * send and record leaves a `sending` row, and the retry reuses the same key, so Resend de-duplicates
 * instead of mailing the person twice.
 */
export async function sendEmails(slug, item, { dry, limit = EMAIL_PER_RUN, pace = EMAIL_PACE_MS } = {}) {
  const section = sectionOf(slug);
  if (!section) throw new Error(`${slug} belongs to no section with a mailing list — nothing to send`);
  const { getSql } = await import('../lib/db.js');
  const { sendEmail, newsletterEmail } = await import('../lib/email.js');
  const sql = getSql();

  // topics = '{}' means "everything"; otherwise the section must be among the chosen ones
  const people = await sql`
    SELECT id, email, email_hash, unsubscribe_token_hash
    FROM subscribers
    WHERE status = 'confirmed' AND email IS NOT NULL
      AND (topics = '{}'::text[] OR ${section.topic} = ANY(topics))
    ORDER BY id`;
  const pending = [];
  for (const person of people) {
    const done = await sql`
      SELECT 1 FROM announcement_deliveries
      WHERE slug = ${slug} AND subscriber_id = ${person.id} AND status = 'sent'`;
    if (done.length === 0) pending.push(person);
  }

  console.log(`— email: ${people.length} підписник(ів) розділу «${section.name}», до надсилання ${pending.length}`);
  if (dry) {
    for (const p of pending.slice(0, limit)) console.log(`   → ${p.email}`);
    if (pending.length > limit) console.log(`   … і ще ${pending.length - limit} — наступним прогоном`);
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const person of pending.slice(0, limit)) {
    // A row created before the deterministic token existed keeps an unrecoverable random hash; fix it
    // here, or that person could never unsubscribe from the letter we are about to send.
    const expected = hashToken(unsubToken(person.email_hash));
    if (person.unsubscribe_token_hash !== expected) {
      await sql`UPDATE subscribers SET unsubscribe_token_hash = ${expected} WHERE id = ${person.id}`;
      console.log(`   (оновив хеш відписки для #${person.id})`);
    }
    const claimed = await sql`
      INSERT INTO announcement_deliveries (slug, subscriber_id, status)
      VALUES (${slug}, ${person.id}, 'sending')
      ON CONFLICT (slug, subscriber_id) DO UPDATE
        SET status = 'sending', updated_at = now()
        WHERE announcement_deliveries.status <> 'sent'
      RETURNING subscriber_id`;
    if (claimed.length === 0) continue; // someone else sent it between the scan and now

    const letter = newsletterEmail({
      title: item.title,
      teaser: item.description,
      link: item.link,
      section: section.name,
      unsubUrl: `${SITE}/api/unsubscribe/?token=${encodeURIComponent(unsubToken(person.email_hash))}`,
    });
    try {
      const res = await sendEmail({
        to: person.email,
        ...letter,
        idempotencyKey: `announce:${slug}:${person.id}`,
      });
      await sql`
        UPDATE announcement_deliveries SET status = 'sent', resend_id = ${res?.id ?? null}, updated_at = now()
        WHERE slug = ${slug} AND subscriber_id = ${person.id}`;
      sent++;
    } catch (err) {
      await sql`
        UPDATE announcement_deliveries SET status = 'failed', error = ${String(err)}, updated_at = now()
        WHERE slug = ${slug} AND subscriber_id = ${person.id}`;
      failed++;
      console.error(`   ✗ #${person.id}: ${String(err)}`);
    }
    if (pace) await new Promise((r) => setTimeout(r, pace));
  }
  const deferred = Math.max(0, pending.length - limit);
  console.log(`— email: надіслано ${sent}, помилок ${failed}, перенесено на наступний прогін ${deferred}`);
}

async function main(argv) {
  const { slug, dry, force, only, note } = parseArgs(argv);
  const item = readItem(slug);
  const text = composePost(item, slug, note);


  if (!only || only === 'feed') {
    if (dry) console.log('— feeds: would regenerate (skipped by --dry)');
    else for (const { feed, count } of writeFeeds()) console.log(`— ${feed.file}: ${count} items`);
  }

  if (only === 'feed') return;

  if (only === 'email') return sendEmails(slug, item, { dry });

  const state = readState();
  const decision = postDecision(state, slug, force);
  if (!decision.post) {
    console.log(`— telegram: ${decision.reason}`);
    return;
  }
  if (dry) {
    console.log(`— telegram: would post to ${process.env.TELEGRAM_CHANNEL_ID ?? '(TELEGRAM_CHANNEL_ID unset)'}:\n`);
    console.log(text);
    return;
  }
  assertEnv();
  const { sendToChannel } = await import('../lib/telegram.js');
  // Claim before sending: if the process dies after Telegram accepted the post but before we record
  // it, the next run must not post a duplicate — it finds the claim and asks for --force.
  saveState(markSent(state, slug, 'tg', 'sending'));
  const res = await sendToChannel(text);
  saveState(markSent(readState(), slug, 'tg'));
  console.log(`— telegram: posted, message_id ${res?.result?.message_id ?? '?'}`);

  // Email last: its state lives in the database, per recipient, so a failure here never costs the
  // channel post — and re-running only picks up whoever has not been sent to.
  if (sectionOf(slug)) await sendEmails(slug, item, { dry });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv();
  main(process.argv.slice(2)).catch((e) => {
    console.error(`announce: ${e.message}`);
    process.exit(1);
  });
}
