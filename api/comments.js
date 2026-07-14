// Public comments API: GET approved comments for a slug, POST a new (pending) comment.
import { getSql } from '../lib/db.js';
import { bump, peek } from '../lib/kv.js';
import { CommentInput } from '../lib/schema.js';
import { sendMessage } from '../lib/telegram.js';
import { jsonError } from '../lib/http.js';
import {
  getClientIp,
  hashIp,
  verifyTurnstile,
  signAction,
  allowedOrigin,
  isSameOriginPost,
  tgEscape,
} from '../lib/security.js';

const RL_MINUTE = 3; // max comments per IP per minute
const RL_HOUR = 10; // max comments per IP per hour
const RL_CAPTCHA_MIN = 20; // max Turnstile verify attempts per IP per minute (anti verify-flood)

/** @param {import('http').ServerResponse} res @param {import('http').IncomingMessage} req */
function setCors(res, req) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin(req) || 'https://www.parkinsandr.tech');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ---- GET: list approved comments for a slug ----
  if (req.method === 'GET') {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
    if (!slug) return res.status(400).json({ error: 'slug required' });
    try {
      const sql = getSql();
      const post = await sql`SELECT 1 FROM posts WHERE slug = ${slug}`;
      if (post.length === 0) return res.status(404).json({ error: 'unknown slug' });
      const rows = await sql`
        SELECT id, parent_id, author_name, body, created_at
        FROM comments
        WHERE slug = ${slug} AND status = 'approved'
        ORDER BY created_at ASC`;
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
      return res.status(200).json({ comments: rows });
    } catch (err) {
      return jsonError(res, 503, 'db_get_comments_failed', err);
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  // ---- POST: submit a new comment ----
  if (!isSameOriginPost(req)) return res.status(403).json({ error: 'forbidden' });

  const parsed = CommentInput.safeParse(typeof req.body === 'object' ? req.body : {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { slug, parent_id, author_name, body, turnstileToken, hp } = parsed.data;
  if (hp) {
    console.warn(JSON.stringify({ level: 'warn', event: 'honeypot_tripped', slug }));
    return res.status(400).json({ error: 'invalid input' });
  }

  const ip = getClientIp(req);
  let ipHash;
  try {
    ipHash = hashIp(ip);
  } catch (err) {
    return jsonError(res, 500, 'config_ip_salt_missing', err);
  }

  // Tier 1 FIRST — before any DB work, so a captcha-less flood can't hammer
  // Postgres with slug/parent lookups: cap verify attempts per IP, plus a racy
  // UX peek of the main limits so an exhausted user gets 429 without burning
  // a one-time captcha token. Fail-closed on KV errors.
  try {
    const captchaMin = await bump(`rl:captcha:min:${ipHash}`, 60);
    if (captchaMin > RL_CAPTCHA_MIN) {
      return res.status(429).json({ error: 'too many requests' });
    }
    const curMin = await peek(`rl:min:${ipHash}`);
    const curHour = await peek(`rl:hr:${ipHash}`);
    if (curMin >= RL_MINUTE || curHour >= RL_HOUR) {
      return res.status(429).json({ error: 'too many requests' });
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'kv_ratelimit_failed', msg: String(err) }));
    return res.status(503).json({ error: 'temporarily unavailable' });
  }

  // slug must be a known page (getSql inside try: missing DATABASE_URL is a config throw)
  let sql;
  try {
    sql = getSql();
    const post = await sql`SELECT 1 FROM posts WHERE slug = ${slug}`;
    if (post.length === 0) return res.status(404).json({ error: 'unknown slug' });
  } catch (err) {
    return jsonError(res, 503, 'db_slug_check_failed', err);
  }

  // parent must exist, same slug, be a top-level, approved comment (1-level threads)
  if (parent_id !== undefined) {
    let p;
    try {
      const parent = await sql`SELECT slug, parent_id, status FROM comments WHERE id = ${parent_id}`;
      p = parent[0];
    } catch (err) {
      return jsonError(res, 503, 'db_parent_check_failed', err);
    }
    if (!p || p.slug !== slug || p.parent_id !== null || p.status !== 'approved') {
      return res.status(400).json({ error: 'invalid parent' });
    }
  }

  // Turnstile (total function for network errors; throws only on missing secret)
  let captchaOk;
  try {
    captchaOk = await verifyTurnstile(turnstileToken, ip);
  } catch (err) {
    return jsonError(res, 500, 'config_turnstile_secret_missing', err);
  }
  if (!captchaOk) return res.status(400).json({ error: 'captcha failed' });

  // Tier 2 (after Turnstile): authoritative comment rate-limit on bump() counts —
  // the peek above is racy, this is the check that actually holds under parallelism.
  try {
    const perMin = await bump(`rl:min:${ipHash}`, 60);
    const perHour = await bump(`rl:hr:${ipHash}`, 3600);
    if (perMin > RL_MINUTE || perHour > RL_HOUR) {
      return res.status(429).json({ error: 'too many requests' });
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'kv_ratelimit_failed', msg: String(err) }));
    return res.status(503).json({ error: 'temporarily unavailable' });
  }

  // Insert as pending
  let id;
  try {
    const inserted = await sql`
      INSERT INTO comments (slug, parent_id, author_name, body, ip_hash, status)
      VALUES (${slug}, ${parent_id ?? null}, ${author_name}, ${body}, ${ipHash}, 'pending')
      RETURNING id`;
    const row = inserted[0];
    if (!row) throw new Error('insert returned no row');
    id = row.id;
  } catch (err) {
    return jsonError(res, 503, 'db_insert_comment_failed', err);
  }

  // Notify moderator. Never fails the request: the comment is already stored,
  // and signAction/sendMessage failures must not turn a 202 into a 500.
  try {
    const preview = body.length > 500 ? body.slice(0, 500) + '…' : body;
    const kb = [
      [
        { text: '✅ Схвалити', callback_data: `a:${id}:${signAction('a', id)}` },
        { text: '🚫 Спам', callback_data: `s:${id}:${signAction('s', id)}` },
      ],
      [{ text: '🗑 Видалити', callback_data: `d:${id}:${signAction('d', id)}` }],
    ];
    const text =
      `💬 <b>Новий коментар</b> #${id}\n` +
      `━━━━━━━━\n` +
      `📄 ${tgEscape(slug)}${parent_id ? ` (відповідь на #${parent_id})` : ''}\n` +
      `👤 ${tgEscape(author_name)}\n` +
      `━━━━━━━━\n${tgEscape(preview)}`;
    await sendMessage(text, kb);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'tg_notify_failed', id, msg: String(err) }));
  }

  return res.status(202).json({ ok: true, message: 'Коментар надіслано на модерацію' });
}
