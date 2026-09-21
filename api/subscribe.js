// Email subscription: POST an address, get a confirmation email (double opt-in).
// The reply never says whether the address is already on the list — that would turn this endpoint
// into a membership oracle — but it also never claims a letter was sent when it was not.
import { getSql } from '../lib/db.js';
import { bump, peek } from '../lib/kv.js';
import { SubscribeInput } from '../lib/schema.js';
import { sendEmail, confirmEmail } from '../lib/email.js';
import { jsonError } from '../lib/http.js';
import {
  getClientIp,
  hashIp,
  hashEmail,
  newToken,
  hashToken,
  verifyTurnstile,
  allowedOrigin,
  isSameOriginPost,
} from '../lib/security.js';

const SITE = 'https://www.parkinsandr.tech';
const RL_CAPTCHA_MIN = 20; // Turnstile verifies per IP per minute
const RL_IP_HOUR = 5; // subscribe attempts per IP per hour
const COOLDOWN_MS = 10 * 60 * 1000; // one confirmation per address per 10 minutes (durable, in the DB)
const MAX_CONFIRMS = 5; // hard cap per address: KV can be reset, this cannot

/** True whether the letter went out now or the address was already on the list — no membership leak. */
const GENERIC = 'Якщо ця адреса ще не підписана, лист із підтвердженням уже в дорозі.';

/** @param {import('http').ServerResponse} res @param {import('http').IncomingMessage} req */
function setCors(res, req) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin(req) || SITE);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!isSameOriginPost(req)) return res.status(403).json({ error: 'forbidden' });

  const parsed = SubscribeInput.safeParse(typeof req.body === 'object' ? req.body : {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { email, topics, turnstileToken, source, hp } = parsed.data;
  if (hp) {
    console.warn(JSON.stringify({ level: 'warn', event: 'honeypot_tripped', endpoint: 'subscribe' }));
    return res.status(400).json({ error: 'invalid input' });
  }

  const ip = getClientIp(req);
  let ipHash;
  let emailHash;
  try {
    ipHash = hashIp(ip);
  } catch (err) {
    return jsonError(res, 500, 'config_ip_salt_missing', err);
  }
  try {
    emailHash = hashEmail(email);
  } catch (err) {
    return jsonError(res, 500, 'config_email_hash_secret_missing', err);
  }

  // Tier 1, before any DB or mail work: cap captcha verifies, and peek at the limits so an
  // exhausted client gets 429 without burning a one-time token. Fail-closed on KV errors.
  try {
    if ((await bump(`rl:sub:captcha:${ipHash}`, 60)) > RL_CAPTCHA_MIN) {
      return res.status(429).json({ error: 'too many requests' });
    }
    if ((await peek(`rl:sub:ip:${ipHash}`)) >= RL_IP_HOUR) {
      return res.status(429).json({ error: 'too many requests' });
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'kv_ratelimit_failed', msg: String(err) }));
    return res.status(503).json({ error: 'temporarily unavailable' });
  }

  let captchaOk;
  try {
    captchaOk = await verifyTurnstile(turnstileToken, ip);
  } catch (err) {
    return jsonError(res, 500, 'config_turnstile_secret_missing', err);
  }
  if (!captchaOk) return res.status(400).json({ error: 'captcha failed' });

  // Tier 2: the authoritative limits. The per-address counters are what stop someone from using
  // this endpoint to bomb one person's inbox — the per-IP one alone would not.
  try {
    if ((await bump(`rl:sub:ip:${ipHash}`, 3600)) > RL_IP_HOUR) {
      return res.status(429).json({ error: 'too many requests' });
    }
    const perAddress = await bump(`rl:sub:email:${emailHash}`, 600);
    const perDay = await bump(`rl:sub:email:day:${emailHash}`, 86400);
    if (perAddress > 1 || perDay > 3) {
      // Say the same thing as the happy path: whether this address is rate-limited is its owner's business.
      return res.status(202).json({ ok: true, message: GENERIC });
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'kv_ratelimit_failed', msg: String(err) }));
    return res.status(503).json({ error: 'temporarily unavailable' });
  }

  let sql;
  let row;
  try {
    sql = getSql();
    // Also match a row whose address was erased on request: email_hash is what survives erasure.
    const found = await sql`
      SELECT id, status, confirm_sent_at, confirm_send_count
      FROM subscribers
      WHERE email = ${email} OR email_hash = ${emailHash}
      LIMIT 1`;
    row = found[0];
  } catch (err) {
    return jsonError(res, 503, 'db_subscriber_lookup_failed', err);
  }

  // Already on the list: send nothing, say the same sentence as everyone else gets.
  if (row?.status === 'confirmed') return res.status(202).json({ ok: true, message: GENERIC });

  // Durable backstop under the KV limits: a reset KV must not reopen the mail cannon.
  if (row) {
    const sentAt = row.confirm_sent_at ? new Date(row.confirm_sent_at).getTime() : 0;
    if (Date.now() - sentAt < COOLDOWN_MS || row.confirm_send_count >= MAX_CONFIRMS) {
      return res.status(202).json({ ok: true, message: GENERIC });
    }
  }

  const raw = newToken();
  const confirmHash = hashToken(raw);
  let id;
  try {
    if (row) {
      // Re-opt-in (pending or previously unsubscribed): a fresh single-use token, consent re-recorded.
      await sql`
        UPDATE subscribers SET
          email = ${email}, status = 'pending', confirm_token_hash = ${confirmHash},
          topics = ${topics}, consent_at = now(), ip_hash = ${ipHash}, source = ${source ?? null},
          confirm_sent_at = now(), confirm_send_count = confirm_send_count + 1
        WHERE id = ${row.id}`;
      id = row.id;
    } else {
      const inserted = await sql`
        INSERT INTO subscribers
          (email, status, email_hash, confirm_token_hash, unsubscribe_token_hash, topics,
           consent_at, ip_hash, source, confirm_sent_at, confirm_send_count)
        VALUES
          (${email}, 'pending', ${emailHash}, ${confirmHash}, ${hashToken(newToken())}, ${topics},
           now(), ${ipHash}, ${source ?? null}, now(), 1)
        RETURNING id`;
      const created = inserted[0];
      if (!created) throw new Error('insert returned no row');
      id = created.id;
    }
  } catch (err) {
    return jsonError(res, 503, 'db_subscriber_write_failed', err);
  }

  const { subject, html, text } = confirmEmail({
    confirmUrl: `${SITE}/api/subscribe/confirm?token=${encodeURIComponent(raw)}`,
    topics,
  });
  try {
    await sendEmail({ to: email, subject, html, text, idempotencyKey: `confirm:${id}:${confirmHash.slice(0, 16)}` });
  } catch (err) {
    // The cooldown was claimed before the send; give it back, or our own outage locks the person out.
    try {
      await sql`UPDATE subscribers SET confirm_sent_at = NULL WHERE id = ${id}`;
    } catch (rollbackErr) {
      console.error(JSON.stringify({ level: 'error', event: 'db_cooldown_rollback_failed', id, msg: String(rollbackErr) }));
    }
    // Never claim a letter is on its way when the provider refused it (the site's rule for forms).
    return jsonError(res, 503, 'email_send_failed', err);
  }

  return res.status(202).json({ ok: true, message: GENERIC });
}
