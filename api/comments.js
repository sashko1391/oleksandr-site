// Public comments API: GET approved comments for a slug, POST a new (pending) comment.
import { getSql } from '../lib/db.js';
import { bump } from '../lib/kv.js';
import { CommentInput } from '../lib/schema.js';
import { sendMessage } from '../lib/telegram.js';
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
const FLOOD_THRESHOLD = 30; // accepted comments/hour before we stop pinging Telegram

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

  const sql = getSql();

  // ---- GET: list approved comments for a slug ----
  if (req.method === 'GET') {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
    if (!slug) return res.status(400).json({ error: 'slug required' });
    const post = await sql`SELECT 1 FROM posts WHERE slug = ${slug}`;
    if (post.length === 0) return res.status(404).json({ error: 'unknown slug' });
    const rows = await sql`
      SELECT id, parent_id, author_name, body, created_at
      FROM comments
      WHERE slug = ${slug} AND status = 'approved'
      ORDER BY created_at ASC`;
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    return res.status(200).json({ comments: rows });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  // ---- POST: submit a new comment ----
  if (!isSameOriginPost(req)) return res.status(403).json({ error: 'forbidden' });

  const parsed = CommentInput.safeParse(typeof req.body === 'object' ? req.body : {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { slug, parent_id, author_name, body, turnstileToken, hp } = parsed.data;
  if (hp) return res.status(400).json({ error: 'invalid input' }); // honeypot tripped

  // slug must be a known page
  const post = await sql`SELECT 1 FROM posts WHERE slug = ${slug}`;
  if (post.length === 0) return res.status(404).json({ error: 'unknown slug' });

  // parent must exist, same slug, be a top-level, approved comment (1-level threads)
  if (parent_id !== undefined) {
    const parent = await sql`SELECT slug, parent_id, status FROM comments WHERE id = ${parent_id}`;
    const p = parent[0];
    if (!p || p.slug !== slug || p.parent_id !== null || p.status !== 'approved') {
      return res.status(400).json({ error: 'invalid parent' });
    }
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  // rate-limit (KV counters, not Postgres COUNT)
  try {
    const perMin = await bump(`rl:min:${ipHash}`, 60);
    const perHour = await bump(`rl:hr:${ipHash}`, 3600);
    if (perMin > RL_MINUTE || perHour > RL_HOUR) {
      return res.status(429).json({ error: 'too many requests' });
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'kv_ratelimit_failed', msg: String(err) }));
    // fail-closed on rate-limit infra error to avoid abuse
    return res.status(503).json({ error: 'temporarily unavailable' });
  }

  // Turnstile
  const ok = await verifyTurnstile(turnstileToken, ip);
  if (!ok) return res.status(400).json({ error: 'captcha failed' });

  // Insert as pending
  const inserted = await sql`
    INSERT INTO comments (slug, parent_id, author_name, body, ip_hash, status)
    VALUES (${slug}, ${parent_id ?? null}, ${author_name}, ${body}, ${ipHash}, 'pending')
    RETURNING id`;
  const id = inserted[0].id;

  // Circuit-breaker: under flood, keep accepting but stop spamming Telegram
  let flooded = false;
  try {
    const hourCount = await bump('cb:accepted:hr', 3600);
    flooded = hourCount > FLOOD_THRESHOLD;
  } catch {
    flooded = false;
  }

  if (!flooded) {
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
    try {
      await sendMessage(text, kb);
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', event: 'tg_notify_failed', id, msg: String(err) }));
    }
  }

  return res.status(202).json({ ok: true, message: 'Коментар надіслано на модерацію' });
}
