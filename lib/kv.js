// Upstash Redis (REST) for rate-limit counters.
// Accepts either Vercel-KV (KV_REST_API_*) or native Upstash (UPSTASH_REDIS_REST_*) env names.
import { Redis } from '@upstash/redis';

let redis;

/** @returns {Redis} */
export function getKv() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error('KV/Upstash REST env is not configured');
    redis = new Redis({ url, token });
  }
  return redis;
}

/**
 * Increment a counter under `key`, set TTL on first hit, return the new count.
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<number>}
 */
export async function bump(key, ttlSeconds) {
  const kv = getKv();
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, ttlSeconds);
  return n;
}

/**
 * Read a counter without incrementing. UX pre-check only — racy by nature;
 * the authoritative limit check is the count returned by bump().
 * @param {string} key
 * @returns {Promise<number>}
 */
export async function peek(key) {
  const kv = getKv();
  const v = await kv.get(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
