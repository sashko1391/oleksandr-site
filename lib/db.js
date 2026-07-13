// Postgres client for Supabase Supavisor (transaction pooler, :6543).
// prepare:false is REQUIRED in transaction mode; max:1 keeps serverless lean.
import postgres from 'postgres';

let sql;

/** @returns {import('postgres').Sql} */
export function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not configured');
    sql = postgres(url, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}
