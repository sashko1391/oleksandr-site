// Security helpers: IP handling, HMAC signing, Turnstile verify, CORS/CSRF.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const ALLOWED_ORIGINS = [
  'https://www.parkinsandr.tech',
  'https://parkinsandr.tech',
];

/**
 * Trustworthy client IP on Vercel. NEVER trust raw X-Forwarded-For (client-spoofable).
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function getClientIp(req) {
  const h = req.headers;
  const raw =
    (typeof h['x-vercel-forwarded-for'] === 'string' && h['x-vercel-forwarded-for']) ||
    (typeof h['x-real-ip'] === 'string' && h['x-real-ip']) ||
    (typeof h['x-forwarded-for'] === 'string' && h['x-forwarded-for'].split(',')[0]) ||
    '';
  return raw.trim();
}

/**
 * Collapse an IP to its rate-limit unit: full IPv4, or /64 prefix for IPv6
 * (one IPv6 user controls a whole /64, so hashing the full address is useless).
 * @param {string} ip
 * @returns {string}
 */
export function ipPrefix(ip) {
  if (!ip) return 'unknown';
  if (ip.includes(':')) {
    const expanded = ip.split('%')[0]; // strip zone id
    const parts = expanded.split(':');
    return parts.slice(0, 4).join(':') + '::/64';
  }
  return ip;
}

/**
 * HMAC-based pseudonymised IP hash (GDPR-friendly; IP_SALT is a server secret).
 * @param {string} ip
 * @returns {string}
 */
export function hashIp(ip) {
  const salt = process.env.IP_SALT;
  if (!salt) throw new Error('IP_SALT is not configured');
  return createHmac('sha256', salt).update(ipPrefix(ip)).digest('hex');
}

/**
 * Sign a moderation action for Telegram callback_data (kept short for the 64-byte limit).
 * @param {'a'|'s'|'d'} action
 * @param {number|string} id
 * @returns {string} 8 hex chars
 */
export function signAction(action, id) {
  const secret = process.env.CALLBACK_HMAC_SECRET;
  if (!secret) throw new Error('CALLBACK_HMAC_SECRET is not configured');
  return createHmac('sha256', secret).update(`${action}:${id}`).digest('hex').slice(0, 8);
}

/**
 * Constant-time verification of a callback signature.
 * @param {string} action
 * @param {number|string} id
 * @param {string} sig
 * @returns {boolean}
 */
export function verifyAction(action, id, sig) {
  const expected = signAction(/** @type {'a'|'s'|'d'} */ (action), id);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Constant-time string comparison for shared secrets (webhook token, cron bearer).
 * Fail-closed: missing/empty side → false. Hash-both-sides equalises length,
 * so there is no length leak and timingSafeEqual never throws.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 * Total function w.r.t. network: fetch/parse failures return false (fail-closed);
 * only a missing TURNSTILE_SECRET throws (config error, handled separately).
 * @param {string} token
 * @param {string} [ip]
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) throw new Error('TURNSTILE_SECRET is not configured');
  if (!token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(5000), // don't hang serverless on a slow verify
    });
    if (!res.ok) return false;
    const data = /** @type {{ success?: boolean }} */ (await res.json());
    return data.success === true;
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'turnstile_verify_failed', msg: String(err) }));
    return false;
  }
}

/**
 * Resolve the CORS origin header value for a request (only our own domains).
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
export function allowedOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' && ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

/**
 * CSRF guard for state-changing requests: same-origin + explicit fetch marker.
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
export function isSameOriginPost(req) {
  const origin = req.headers.origin;
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith !== 'fetch') return false;
  if (typeof origin === 'string') return ALLOWED_ORIGINS.includes(origin);
  // Fallback to Referer when Origin is absent.
  const ref = req.headers.referer;
  return typeof ref === 'string' && ALLOWED_ORIGINS.some((o) => ref.startsWith(o + '/'));
}

/**
 * Escape text for Telegram HTML parse_mode.
 * @param {string} s
 * @returns {string}
 */
export function tgEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
