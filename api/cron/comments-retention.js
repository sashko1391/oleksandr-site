// Scheduled retention: drop ip_hash from comments older than 30 days (GDPR).
// Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET.
import { getSql } from '../../lib/db.js';
import { safeEqual } from '../../lib/security.js';
import { jsonError } from '../../lib/http.js';

export default async function handler(req, res) {
  // Explicit guard BEFORE concatenation: with a missing env the expected value
  // would become the literal "Bearer undefined" and auth would fail open.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(JSON.stringify({ level: 'error', event: 'cron_secret_missing' }));
    return res.status(401).end();
  }
  if (!safeEqual(req.headers.authorization, `Bearer ${secret}`)) {
    return res.status(401).end();
  }
  try {
    const sql = getSql();
    const cleared = await sql`
      UPDATE comments SET ip_hash = NULL
      WHERE ip_hash IS NOT NULL AND created_at < now() - interval '30 days'
      RETURNING id`;
    console.log(JSON.stringify({ level: 'info', event: 'retention_run', cleared: cleared.length }));
    return res.status(200).json({ ok: true, cleared: cleared.length });
  } catch (err) {
    return jsonError(res, 503, 'db_retention_failed', err); // db_* → 503 (config_* → 500)
  }
}
