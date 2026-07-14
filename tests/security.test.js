import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { signAction, verifyAction, ipPrefix, hashIp, tgEscape, safeEqual, verifyTurnstile } from '../lib/security.js';

beforeAll(() => {
  process.env.IP_SALT = 'test-salt';
  process.env.CALLBACK_HMAC_SECRET = 'test-hmac-secret';
});

describe('callback signing', () => {
  it('produces an 8-char hex signature that verifies', () => {
    const sig = signAction('a', 42);
    expect(sig).toMatch(/^[0-9a-f]{8}$/);
    expect(verifyAction('a', 42, sig)).toBe(true);
  });
  it('rejects a tampered id, action or signature', () => {
    const sig = signAction('a', 42);
    expect(verifyAction('a', 43, sig)).toBe(false);
    expect(verifyAction('d', 42, sig)).toBe(false);
    expect(verifyAction('a', 42, 'deadbeef')).toBe(false);
    expect(verifyAction('a', 42, '')).toBe(false);
  });
});

describe('ipPrefix', () => {
  it('keeps IPv4 intact', () => {
    expect(ipPrefix('203.0.113.7')).toBe('203.0.113.7');
  });
  it('collapses IPv6 to a /64', () => {
    expect(ipPrefix('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
  });
  it('handles empty input', () => {
    expect(ipPrefix('')).toBe('unknown');
  });
});

describe('hashIp', () => {
  it('is deterministic and 64-hex', () => {
    const a = hashIp('203.0.113.7');
    const b = hashIp('203.0.113.7');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('collapses a whole IPv6 /64 to one hash', () => {
    expect(hashIp('2001:db8:1:2:aa:bb:cc:dd')).toBe(hashIp('2001:db8:1:2:99:88:77:66'));
  });
  it('differs across distinct IPs', () => {
    expect(hashIp('203.0.113.7')).not.toBe(hashIp('203.0.113.8'));
  });
});

describe('tgEscape', () => {
  it('escapes HTML-significant chars', () => {
    expect(tgEscape('<b>&"</b>')).toBe('&lt;b&gt;&amp;"&lt;/b&gt;');
  });
});

describe('safeEqual', () => {
  it('true for equal strings', () => {
    expect(safeEqual('secret-token', 'secret-token')).toBe(true);
  });
  it('false for different strings (incl. different length)', () => {
    expect(safeEqual('secret-token', 'secret-tokeX')).toBe(false);
    expect(safeEqual('short', 'a-much-longer-string')).toBe(false);
  });
  it('fail-closed on missing/empty sides, never throws', () => {
    expect(safeEqual(undefined, 'x')).toBe(false);
    expect(safeEqual('x', undefined)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual(null, null)).toBe(false);
  });
});

describe('verifyTurnstile (total function)', () => {
  const origFetch = globalThis.fetch;
  beforeAll(() => { process.env.TURNSTILE_SECRET = 'ts-secret'; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('returns false when fetch throws (network fail), does not throw', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(verifyTurnstile('tok', '203.0.113.7')).resolves.toBe(false);
  });
  it('returns false on non-ok HTTP', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(verifyTurnstile('tok')).resolves.toBe(false);
  });
  it('returns true on success:true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await expect(verifyTurnstile('tok')).resolves.toBe(true);
  });
  it('returns false on empty token without calling fetch', async () => {
    globalThis.fetch = vi.fn();
    await expect(verifyTurnstile('')).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
