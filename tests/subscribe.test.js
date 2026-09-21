// Handler tests for the email subscription: api/subscribe.js, api/subscribe/confirm.js,
// api/unsubscribe.js. DB / KV / Resend are mocked; the security helpers stay real (so the
// hashing that protects the tokens is actually exercised) except verifyTurnstile.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sqlMock = vi.fn();
vi.mock('../lib/db.js', () => ({ getSql: () => sqlMock }));

const bumpMock = vi.fn();
const peekMock = vi.fn();
vi.mock('../lib/kv.js', () => ({ bump: (...a) => bumpMock(...a), peek: (...a) => peekMock(...a) }));

const sendEmailMock = vi.fn();
vi.mock('../lib/email.js', async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, sendEmail: (...a) => sendEmailMock(...a) };
});

vi.mock('../lib/security.js', async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, verifyTurnstile: vi.fn() };
});

import subscribeHandler from '../api/subscribe.js';
import confirmHandler from '../api/subscribe/confirm.js';
import unsubscribeHandler from '../api/unsubscribe.js';
import retentionHandler from '../api/cron/subscribers-retention.js';
import { verifyTurnstile, hashToken } from '../lib/security.js';

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: undefined, html: undefined, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.html = b; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

const validBody = () => ({
  email: 'reader@example.com',
  topics: ['parkinson'],
  consent: true,
  turnstileToken: 'tok',
  source: '/parkinson/',
});

function postReq(overrides = {}) {
  const { headers, ...rest } = overrides;
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.parkinsandr.tech',
      'x-requested-with': 'fetch',
      'x-vercel-forwarded-for': '203.0.113.7',
      ...(headers || {}),
    },
    query: {},
    body: validBody(),
    ...rest,
  };
}

/** Route sql`…` by query text. `found` is the existing subscribers row, if any. */
function routeSql({ found = [], insert = [{ id: 42 }], update = [{ id: 42 }] } = {}) {
  sqlMock.mockImplementation(async (strings) => {
    const q = strings.join('');
    if (q.includes('FROM subscribers')) return found;
    if (q.includes('INSERT INTO subscribers')) return insert;
    if (q.includes('UPDATE subscribers')) return update;
    return [];
  });
}

/** Every value passed to sql`…`, flattened — for asserting what reached the database. */
const sqlValues = () => sqlMock.mock.calls.flatMap((call) => call.slice(1));
const sqlQueries = () => sqlMock.mock.calls.map((call) => call[0].join('?'));

beforeAll(() => {
  process.env.IP_SALT = 'test-salt';
  process.env.EMAIL_HASH_SECRET = 'test-email-secret';
  process.env.TURNSTILE_SECRET = 'test-turnstile';
  process.env.RESEND_API_KEY = 'test-resend';
});

beforeEach(() => {
  vi.clearAllMocks();
  verifyTurnstile.mockResolvedValue(true);
  bumpMock.mockResolvedValue(1);
  peekMock.mockResolvedValue(0);
  sendEmailMock.mockResolvedValue({ id: 'email-1' });
  routeSql();
});

describe('POST /api/subscribe — rejections', () => {
  it('403 without the same-origin marker (CSRF guard)', async () => {
    const res = mockRes();
    await subscribeHandler(postReq({ headers: { 'x-requested-with': undefined } }), res);
    expect(res.statusCode).toBe(403);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('405 on GET, 204 on preflight', async () => {
    const get = mockRes();
    await subscribeHandler({ ...postReq(), method: 'GET' }, get);
    expect(get.statusCode).toBe(405);
    const options = mockRes();
    await subscribeHandler({ ...postReq(), method: 'OPTIONS' }, options);
    expect(options.statusCode).toBe(204);
  });

  it('400 on a malformed address, a missing consent or an unknown topic', async () => {
    for (const body of [
      { ...validBody(), email: 'not-an-email' },
      { ...validBody(), consent: false },
      { ...validBody(), topics: ['finance'] },
      {},
    ]) {
      const res = mockRes();
      await subscribeHandler(postReq({ body }), res);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('400 and a log when the honeypot is filled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = mockRes();
    await subscribeHandler(postReq({ body: { ...validBody(), hp: 'bot' } }), res);
    expect(res.statusCode).toBe(400);
    expect(warn.mock.calls[0][0]).toContain('honeypot_tripped');
    expect(sendEmailMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('400 when Turnstile rejects, without touching the database', async () => {
    verifyTurnstile.mockResolvedValue(false);
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it('429 on the captcha-verify flood cap, before Turnstile is even called', async () => {
    bumpMock.mockResolvedValue(21);
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(429);
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it('429 when this IP already used up its hourly attempts', async () => {
    peekMock.mockResolvedValue(5);
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(429);
  });

  it('503 fail-closed when the rate-limit store is down', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    bumpMock.mockRejectedValue(new Error('kv down'));
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(503);
    expect(sendEmailMock).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('POST /api/subscribe — the happy path and what it stores', () => {
  it('202, one insert, one confirmation email', async () => {
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(202);
    expect(sqlQueries().some((q) => q.includes('INSERT INTO subscribers'))).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('reader@example.com');
  });

  it('stores only hashes: the raw token is in the email and nowhere else', async () => {
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    const url = sendEmailMock.mock.calls[0][0].text.match(/https:\/\/\S+token=(\S+)/)[1];
    const raw = decodeURIComponent(url);
    expect(raw.length).toBeGreaterThan(20);
    const stored = sqlValues().map(String);
    expect(stored, 'the raw token must never reach the database').not.toContain(raw);
    expect(stored, 'the database must hold its hash').toContain(hashToken(raw));
  });

  it('stores the address lowercased, with consent, the IP hash and the topics', async () => {
    const res = mockRes();
    await subscribeHandler(postReq({ body: { ...validBody(), email: 'Reader@Example.COM' } }), res);
    const stored = sqlValues();
    expect(stored).toContain('reader@example.com');
    expect(stored).toContainEqual(['parkinson']);
    expect(stored).toContain('/parkinson/');
    expect(sqlQueries().join(' ')).toContain('consent_at');
  });

  it('never puts the address itself in the rate-limit keys (only its HMAC)', async () => {
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    for (const [key] of bumpMock.mock.calls) {
      expect(key, key).not.toContain('reader@example.com');
      expect(key).toMatch(/^rl:sub:/);
    }
  });

  it('says the same sentence whether or not a letter went out', async () => {
    const fresh = mockRes();
    await subscribeHandler(postReq(), fresh);
    const confirmed = mockRes();
    routeSql({ found: [{ id: 9, status: 'confirmed', confirm_sent_at: null, confirm_send_count: 0 }] });
    await subscribeHandler(postReq(), confirmed);
    expect(confirmed.statusCode).toBe(202);
    expect(confirmed.body.message).toBe(fresh.body.message);
    expect(sendEmailMock, 'an address already on the list gets no second letter').toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/subscribe — bombing one address', () => {
  it('sends nothing when the per-address counter is already used up', async () => {
    bumpMock.mockImplementation(async (key) => (key.startsWith('rl:sub:email:') ? 2 : 1));
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(202);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it('sends nothing inside the cooldown even when the counters were reset', async () => {
    bumpMock.mockResolvedValue(1); // KV says "go ahead" — the durable check must still hold
    routeSql({
      found: [{ id: 9, status: 'pending', confirm_sent_at: new Date().toISOString(), confirm_send_count: 1 }],
    });
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(202);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('stops for good after the hard cap, however old the last letter is', async () => {
    routeSql({
      found: [{ id: 9, status: 'pending', confirm_sent_at: '2020-01-01T00:00:00Z', confirm_send_count: 5 }],
    });
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does resend once the cooldown has passed, with a brand-new token', async () => {
    routeSql({
      found: [{ id: 9, status: 'pending', confirm_sent_at: '2020-01-01T00:00:00Z', confirm_send_count: 1 }],
    });
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(202);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sqlQueries().some((q) => q.includes('UPDATE subscribers'))).toBe(true);
  });

  it('lets someone who unsubscribed opt in again, through a fresh confirmation', async () => {
    routeSql({
      found: [{ id: 9, status: 'unsubscribed', confirm_sent_at: null, confirm_send_count: 1 }],
    });
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(202);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sqlQueries().some((q) => q.includes("status = 'pending'"))).toBe(true);
  });
});

describe('POST /api/subscribe — when the provider fails', () => {
  it('503 instead of promising a letter, and the cooldown is given back', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendEmailMock.mockRejectedValue(new Error('resend_failed:500'));
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBeTruthy();
    expect(sqlQueries().some((q) => q.includes('confirm_sent_at = NULL'))).toBe(true);
    err.mockRestore();
  });

  it('503 when the write fails — no email is attempted', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    sqlMock.mockImplementation(async (strings) => {
      if (strings.join('').includes('INSERT INTO subscribers')) throw new Error('pooler reset');
      return [];
    });
    const res = mockRes();
    await subscribeHandler(postReq(), res);
    expect(res.statusCode).toBe(503);
    expect(sendEmailMock).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('/api/subscribe/confirm', () => {
  const token = 'A'.repeat(32);

  it('GET renders a button and changes nothing', async () => {
    const res = mockRes();
    await confirmHandler({ method: 'GET', query: { token }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.html).toContain('<form method="post"');
    expect(res.html).toContain('Підтвердити підписку');
    expect(sqlMock, 'a prefetching mail scanner must not confirm anything').not.toHaveBeenCalled();
  });

  it('GET does not leak the token through the Referer or into a cache', async () => {
    const res = mockRes();
    await confirmHandler({ method: 'GET', query: { token }, headers: {} }, res);
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Robots-Tag']).toContain('noindex');
  });

  it('POST confirms by token HASH, and only a pending row', async () => {
    routeSql({ update: [{ id: 42 }] });
    const res = mockRes();
    await confirmHandler({ method: 'POST', query: {}, body: { token }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.html).toContain('підтверджено');
    expect(sqlValues()).toContain(hashToken(token));
    expect(sqlValues(), 'the raw token must not be used as a key').not.toContain(token);
    const q = sqlQueries().join(' ');
    expect(q).toContain("status = 'confirmed'");
    expect(q).toContain('confirm_token_hash = NULL'); // single use
    expect(q).toContain("status = 'pending'");
  });

  it('a second click writes nothing and still says something sensible', async () => {
    routeSql({ update: [] }); // the first click already cleared the hash
    const res = mockRes();
    await confirmHandler({ method: 'POST', query: {}, body: { token }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.html).toContain('вже');
  });

  it('a malformed token gets a page, not a stack trace', async () => {
    const res = mockRes();
    await confirmHandler({ method: 'POST', query: {}, body: { token: 'short' }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.html).toContain('не спрацювало');
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it('503 when the database is down', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    sqlMock.mockRejectedValue(new Error('pooler reset'));
    const res = mockRes();
    await confirmHandler({ method: 'POST', query: {}, body: { token }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    err.mockRestore();
  });
});

describe('/api/unsubscribe', () => {
  const token = 'B'.repeat(32);

  it('GET renders a button and changes nothing', async () => {
    const res = mockRes();
    await unsubscribeHandler({ method: 'GET', query: { token }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.html).toContain('<form method="post"');
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it('POST unsubscribes — with no Origin and no X-Requested-With (RFC 8058)', async () => {
    const res = mockRes();
    await unsubscribeHandler({ method: 'POST', query: { token }, body: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(sqlQueries().join(' ')).toContain("status = 'unsubscribed'");
    expect(sqlValues()).toContain(hashToken(token));
  });

  it('answers a one-click POST with a status code, not a page', async () => {
    const res = mockRes();
    await unsubscribeHandler(
      { method: 'POST', query: { token }, body: { 'List-Unsubscribe': 'One-Click' }, headers: {} },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.html).toBeUndefined();
  });

  it('never clears the token — archived letters still link it, so a repeat must work', async () => {
    const res = mockRes();
    await unsubscribeHandler({ method: 'POST', query: { token }, body: {}, headers: {} }, res);
    const q = sqlQueries().join(' ');
    expect(q).not.toContain('unsubscribe_token_hash = NULL');
    routeSql({ update: [] }); // a second time: nothing left to change
    const again = mockRes();
    await unsubscribeHandler({ method: 'POST', query: { token }, body: {}, headers: {} }, again);
    expect(again.statusCode).toBe(200);
  });

  it('405 on anything but GET and POST', async () => {
    const res = mockRes();
    await unsubscribeHandler({ method: 'DELETE', query: { token }, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('records when the person unsubscribed, keeping the first time if it happens twice', () => {
    // the retention cron erases the address 30 days after this timestamp
    const src = readFileSync(join(process.cwd(), 'api', 'unsubscribe.js'), 'utf8');
    expect(src).toContain('unsubscribed_at = coalesce(unsubscribed_at, now())');
  });
});

describe('cron: subscribers retention', () => {
  const authed = { method: 'POST', headers: { authorization: 'Bearer cron-secret' } };

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    sqlMock.mockResolvedValue([{ id: 1 }]);
  });

  it('401 without the bearer, and without touching the database', async () => {
    const res = mockRes();
    await retentionHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it('401 — never open — when CRON_SECRET itself is missing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.CRON_SECRET;
    const res = mockRes();
    await retentionHandler({ method: 'POST', headers: { authorization: 'Bearer undefined' } }, res);
    expect(res.statusCode).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('drops unconfirmed rows after 7 days, counting from the letter that was actually sent', async () => {
    const res = mockRes();
    await retentionHandler(authed, res);
    expect(res.statusCode).toBe(200);
    const del = sqlQueries().find((q) => q.includes('DELETE FROM subscribers'));
    expect(del).toContain("status = 'pending'");
    expect(del).toContain('coalesce(confirm_sent_at, created_at)');
    expect(del).toContain("interval '7 days'");
  });

  it('anonymises the consent IP after 30 days and erases an unsubscribed address after 30 more', async () => {
    const res = mockRes();
    await retentionHandler(authed, res);
    const qs = sqlQueries().join(' | ');
    expect(qs).toContain('SET ip_hash = NULL');
    expect(qs).toContain('SET email = NULL');
    expect(qs).toContain('unsubscribed_at < now() - ');
    // the suppression hash must survive: it is what stops us mailing that person again
    expect(qs, 'email_hash must never be cleared').not.toContain('email_hash = NULL');
    expect(res.body).toEqual({ ok: true, unconfirmed: 1, ips: 1, erased: 1 });
  });

  it('503 when the database is down', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    sqlMock.mockRejectedValue(new Error('pooler reset'));
    const res = mockRes();
    await retentionHandler(authed, res);
    expect(res.statusCode).toBe(503);
    err.mockRestore();
  });
});
