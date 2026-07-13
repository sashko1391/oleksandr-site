// Scheduled retention: drop ip_hash from comments older than 30 days (GDPR).
// Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET.
import { getSql } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  const sql = getSql();
  const cleared = await sql`
    UPDATE comments SET ip_hash = NULL
    WHERE ip_hash IS NOT NULL AND created_at < now() - interval '30 days'
    RETURNING id`;
  console.log(JSON.stringify({ level: 'info', event: 'retention_run', cleared: cleared.length }));
  return res.status(200).json({ ok: true, cleared: cleared.length });
}
