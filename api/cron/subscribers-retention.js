// Scheduled retention for the mailing list (GDPR storage limitation), run daily by Vercel Cron:
//  1. an address that was never confirmed disappears after 7 days — we hold nobody's address on a maybe
//     (unless it carries a suppression record, which is parked back as unsubscribed instead);
//  2. the IP hash kept as consent proof is dropped after 30 days (consent_at/confirmed_at remain);
//  3. 30 days after someone unsubscribes the address itself is erased, leaving only its HMAC, which is
//     what keeps us from ever mailing that person again and cannot be turned back into an address.
import { getSql } from '../../lib/db.js';
import { safeEqual } from '../../lib/security.js';
import { jsonError } from '../../lib/http.js';

export default async function handler(req, res) {
  // Explicit guard BEFORE concatenation: with a missing env the expected value would become the
  // literal "Bearer undefined" and auth would fail open.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(JSON.stringify({ level: 'error', event: 'cron_secret_missing' }));
    return res.status(401).end();
  }
  if (!safeEqual(req.headers.authorization, `Bearer ${secret}`)) return res.status(401).end();

  try {
    const sql = getSql();
    // Someone who unsubscribed and was then re-added (by themselves or by anyone typing their address)
    // must NOT lose their suppression record if the new opt-in is never confirmed: park the row back as
    // unsubscribed instead of deleting it. email_hash is what keeps us from ever mailing them again.
    const parked = await sql`
      UPDATE subscribers SET status = 'unsubscribed', confirm_token_hash = NULL
      WHERE status = 'pending' AND unsubscribed_at IS NOT NULL
        AND coalesce(confirm_sent_at, created_at) < now() - interval '7 days'
      RETURNING id`;
    // coalesce(confirm_sent_at, created_at): a row that was re-used has an old created_at, and must get
    // the full 7 days from the letter it was actually sent.
    const unconfirmed = await sql`
      DELETE FROM subscribers
      WHERE status = 'pending' AND unsubscribed_at IS NULL
        AND coalesce(confirm_sent_at, created_at) < now() - interval '7 days'
      RETURNING id`;
    const ips = await sql`
      UPDATE subscribers SET ip_hash = NULL
      WHERE ip_hash IS NOT NULL AND coalesce(consent_at, created_at) < now() - interval '30 days'
      RETURNING id`;
    // Erase everything that is not needed to keep from mailing this person again: the address, what
    // they read, where they subscribed from. What stays is the row id, email_hash, the unsubscribe
    // token hash that archived letters still link, and the timestamps.
    const erased = await sql`
      UPDATE subscribers SET email = NULL, topics = '{}'::text[], source = NULL, ip_hash = NULL
      WHERE status = 'unsubscribed' AND email IS NOT NULL
        AND unsubscribed_at < now() - interval '30 days'
      RETURNING id`;
    const result = {
      parked: parked.length, unconfirmed: unconfirmed.length, ips: ips.length, erased: erased.length,
    };
    console.log(JSON.stringify({ level: 'info', event: 'subscribers_retention_run', ...result }));
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return jsonError(res, 503, 'db_subscribers_retention_failed', err); // db_* → 503 (config_* → 500)
  }
}
