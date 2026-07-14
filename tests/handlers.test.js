// Handler-level tests for api/comments.js, api/tg-webhook.js, api/cron/comments-retention.js.
// DB / KV / Telegram are mocked; security helpers stay real except verifyTurnstile.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ---- mocks (hoisted) ----
const sqlMock = vi.fn();
vi.mock('../lib/db.js', () => ({ getSql: () => sqlMock }));

const bumpMock = vi.fn();
const peekMock = vi.fn();
vi.mock('../lib/kv.js', () => ({
  bump: (...a) => bumpMock(...a),
  peek: (...a) => peekMock(...a),
}));

const sendMessageMock = vi.fn();
const answerCallbackMock = vi.fn();
const editMessageTextMock = vi.fn();
vi.mock('../lib/telegram.js', () => ({
  sendMessage: (...a) => sendMessageMock(...a),
  answerCallback: (...a) => answerCallbackMock(...a),
  editMessageText: (...a) => editMessageTextMock(...a),
}));

vi.mock('../lib/security.js', async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, verifyTurnstile: vi.fn() };
});

import commentsHandler from '../api/comments.js';
import webhookHandler from '../api/tg-webhook.js';
import cronHandler from '../api/cron/comments-retention.js';
import { verifyTurnstile, signAction } from '../lib/security.js';

// ---- helpers ----
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: undefined, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

const validBody = () => ({
  slug: 'blog/test',
  author_name: 'Оля',
  body: 'Гарний текст.',
  consent: true,
  turnstileToken: 'tok',
});

function postReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.parkinsandr.tech',
      'x-requested-with': 'fetch',
      'x-vercel-forwarded-for': '203.0.113.7',
      ...(overrides.headers || {}),
    },
    query: {},
    body: validBody(),
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'headers')),
  };
}

/** Route sql`...` calls by query text. Overrides: {posts, parent, insert, comments} */
function routeSql({ posts = [{ one: 1 }], parent = [], insert = [{ id: 7 }], comments = [] } = {}) {
  sqlMock.mockImplementation(async (strings) => {
    const q = strings.join('');
    if (q.includes('FROM posts')) return posts;
    if (q.includes('FROM comments') && q.includes('WHERE id')) return parent;
    if (q.includes('INSERT INTO comments')) return insert;
    if (q.includes('FROM comments')) return comments;
    if (q.includes('UPDATE comments')) return [{ id: 7 }];
    return [];
  });
}

beforeAll(() => {
  process.env.IP_SALT = 'test-salt';
  process.env.CALLBACK_HMAC_SECRET = 'test-hmac-secret';
  process.env.TG_WEBHOOK_SECRET = 'wh-secret';
  process.env.TELEGRAM_CHAT_ID = '111';
  delete process.env.TELEGRAM_ADMIN_USER_ID;
});

beforeEach(() => {
  vi.clearAllMocks();
  routeSql();
  bumpMock.mockResolvedValue(1);
  peekMock.mockResolvedValue(0);
  verifyTurnstile.mockResolvedValue(true);
  sendMessageMock.mockResolvedValue({ ok: true });
  answerCallbackMock.mockResolvedValue({ ok: true });
  editMessageTextMock.mockResolvedValue({ ok: true });
});

// ================= api/comments.js =================
describe('comments GET', () => {
  it('400 without slug', async () => {
    const res = mockRes();
    await commentsHandler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(400);
  });
  it('404 for unknown slug', async () => {
    routeSql({ posts: [] });
    const res = mockRes();
    await commentsHandler({ method: 'GET', headers: {}, query: { slug: 'nope' } }, res);
    expect(res.statusCode).toBe(404);
  });
  it('200 with approved comments + cache header', async () => {
    routeSql({ comments: [{ id: 1, parent_id: null, author_name: 'A', body: 'b', created_at: 'x' }] });
    const res = mockRes();
    await commentsHandler({ method: 'GET', headers: {}, query: { slug: 'blog/test' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.headers['Cache-Control']).toContain('max-age=30');
  });
});

describe('comments POST — guards', () => {
  it('405 for non-GET/POST', async () => {
    const res = mockRes();
    await commentsHandler({ method: 'PUT', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
  it('403 without x-requested-with (CSRF)', async () => {
    const res = mockRes();
    await commentsHandler(postReq({ headers: { 'x-requested-with': undefined } }), res);
    expect(res.statusCode).toBe(403);
  });
  it('403 with foreign origin', async () => {
    const res = mockRes();
    await commentsHandler(postReq({ headers: { origin: 'https://evil.example' } }), res);
    expect(res.statusCode).toBe(403);
  });
  it('400 on invalid input (missing body text)', async () => {
    const res = mockRes();
    const req = postReq(); delete req.body.body;
    await commentsHandler(req, res);
    expect(res.statusCode).toBe(400);
  });
  it('400 when honeypot is filled', async () => {
    const res = mockRes();
    const req = postReq(); req.body.hp = 'bot';
    await commentsHandler(req, res);
    expect(res.statusCode).toBe(400);
  });
  it('404 for unknown slug', async () => {
    routeSql({ posts: [] });
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(404);
  });
  it('400 for invalid parent (missing / wrong slug / nested / not approved)', async () => {
    routeSql({ parent: [] });
    const res = mockRes();
    const req = postReq(); req.body.parent_id = 5;
    await commentsHandler(req, res);
    expect(res.statusCode).toBe(400);

    routeSql({ parent: [{ slug: 'blog/test', parent_id: 3, status: 'approved' }] });
    const res2 = mockRes();
    await commentsHandler(postReq({ body: { ...validBody(), parent_id: 5 } }), res2);
    expect(res2.statusCode).toBe(400);
  });
  it('400 when captcha fails', async () => {
    verifyTurnstile.mockResolvedValue(false);
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('captcha failed');
  });
});

describe('comments POST — happy path', () => {
  it('202, inserts and notifies Telegram once', async () => {
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(202);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const insertCall = sqlMock.mock.calls.find(([s]) => s.join('').includes('INSERT INTO comments'));
    expect(insertCall).toBeTruthy();
  });
  it('202 even when Telegram notify throws', async () => {
    sendMessageMock.mockRejectedValue(new Error('tg down'));
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(202);
  });
  it('503 fail-closed when KV rate-limit is down', async () => {
    bumpMock.mockRejectedValue(new Error('kv down'));
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(503);
  });
});

describe('comments POST — two-tier rate-limit', () => {
  it('429 from captcha pre-limit; neither Turnstile nor Postgres is touched', async () => {
    bumpMock.mockImplementation(async (key) => (key.startsWith('rl:captcha') ? 21 : 1));
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(429);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled(); // rate-limit runs BEFORE slug/parent DB checks
  });
  it('429 from peek of the main limit BEFORE Turnstile (does not burn the token)', async () => {
    peekMock.mockImplementation(async (key) => (key.startsWith('rl:min') ? 3 : 0));
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(429);
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });
  it('failed captcha does not bump the main comment counters', async () => {
    verifyTurnstile.mockResolvedValue(false);
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(400);
    const bumpedKeys = bumpMock.mock.calls.map(([k]) => k);
    expect(bumpedKeys.some((k) => k.startsWith('rl:captcha'))).toBe(true);
    expect(bumpedKeys.some((k) => k.startsWith('rl:min') || k.startsWith('rl:hr'))).toBe(false);
  });
  it('authoritative 429 on bump count even when peek passed (race)', async () => {
    bumpMock.mockImplementation(async (key) => (key.startsWith('rl:min') ? 4 : 1));
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(429);
    const insertCall = sqlMock.mock.calls.find(([s]) => s.join('').includes('INSERT INTO comments'));
    expect(insertCall).toBeUndefined();
  });
});

describe('comments — error events (config ≠ db)', () => {
  it('503 db_insert_comment_failed when INSERT throws', async () => {
    sqlMock.mockImplementation(async (strings) => {
      const q = strings.join('');
      if (q.includes('FROM posts')) return [{ one: 1 }];
      if (q.includes('INSERT INTO comments')) throw new Error('pooler reset');
      return [];
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(503);
    expect(errSpy.mock.calls.some(([m]) => String(m).includes('db_insert_comment_failed'))).toBe(true);
    errSpy.mockRestore();
  });
  it('503 db_get_comments_failed when GET select throws', async () => {
    sqlMock.mockRejectedValue(new Error('pooler reset'));
    const res = mockRes();
    await commentsHandler({ method: 'GET', headers: {}, query: { slug: 'blog/test' } }, res);
    expect(res.statusCode).toBe(503);
  });
  it('500 config_ip_salt_missing when IP_SALT is absent (not a 503 db error)', async () => {
    const salt = process.env.IP_SALT;
    delete process.env.IP_SALT;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await commentsHandler(postReq(), res);
    expect(res.statusCode).toBe(500);
    expect(errSpy.mock.calls.some(([m]) => String(m).includes('config_ip_salt_missing'))).toBe(true);
    errSpy.mockRestore();
    process.env.IP_SALT = salt;
  });
  it('logs honeypot_tripped on filled hp', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = mockRes();
    const req = postReq(); req.body.hp = 'bot';
    await commentsHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(warnSpy.mock.calls.some(([m]) => String(m).includes('honeypot_tripped'))).toBe(true);
    warnSpy.mockRestore();
  });
});

// ================= api/tg-webhook.js =================
function webhookReq(cqOverrides = {}, headers = {}) {
  return {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'wh-secret', ...headers },
    body: {
      callback_query: {
        id: 'cb1',
        data: `a:7:${signAction('a', 7)}`,
        from: { id: 1 },
        message: { chat: { id: 111 }, message_id: 5, text: 'msg' },
        ...cqOverrides,
      },
    },
  };
}

describe('tg-webhook', () => {
  it('401 on wrong or missing secret token', async () => {
    const res = mockRes();
    await webhookHandler(webhookReq({}, { 'x-telegram-bot-api-secret-token': 'wrong' }), res);
    expect(res.statusCode).toBe(401);

    const res2 = mockRes();
    await webhookHandler(webhookReq({}, { 'x-telegram-bot-api-secret-token': undefined }), res2);
    expect(res2.statusCode).toBe(401);
  });
  it('401 fail-closed when TG_WEBHOOK_SECRET env is missing', async () => {
    const saved = process.env.TG_WEBHOOK_SECRET;
    delete process.env.TG_WEBHOOK_SECRET;
    const res = mockRes();
    await webhookHandler(webhookReq({}, { 'x-telegram-bot-api-secret-token': 'undefined' }), res);
    expect(res.statusCode).toBe(401);
    process.env.TG_WEBHOOK_SECRET = saved;
  });
  it('200 ok for non-callback updates', async () => {
    const res = mockRes();
    await webhookHandler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'wh-secret' }, body: { message: {} } }, res);
    expect(res.statusCode).toBe(200);
  });
  it('200 {ok:false} for a chat outside the allowlist (no Telegram retry loop), no DB write', async () => {
    const res = mockRes();
    await webhookHandler(webhookReq({ message: { chat: { id: 999 }, message_id: 5, text: 'x' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it('200 {ok:false} on tampered HMAC, no DB write', async () => {
    const res = mockRes();
    await webhookHandler(webhookReq({ data: 'a:7:deadbeef' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(sqlMock).not.toHaveBeenCalled();
  });
  it('happy path: applies status, answers and edits the message', async () => {
    const res = mockRes();
    await webhookHandler(webhookReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(answerCallbackMock).toHaveBeenCalledTimes(1);
    expect(editMessageTextMock).toHaveBeenCalledTimes(1);
  });
  it('503 db_tg_update_failed when UPDATE throws (Telegram will retry, idempotent)', async () => {
    sqlMock.mockRejectedValue(new Error('pooler reset'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await webhookHandler(webhookReq(), res);
    expect(res.statusCode).toBe(503);
    expect(errSpy.mock.calls.some(([m]) => String(m).includes('db_tg_update_failed'))).toBe(true);
    errSpy.mockRestore();
  });
  it('still 200 when Telegram replies fail after a successful UPDATE', async () => {
    answerCallbackMock.mockRejectedValue(new Error('tg down'));
    editMessageTextMock.mockRejectedValue(new Error('tg down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await webhookHandler(webhookReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    errSpy.mockRestore();
  });
});

// ================= api/cron/comments-retention.js =================
describe('cron retention', () => {
  it('401 fail-closed when CRON_SECRET env is missing, even for "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await cronHandler({ method: 'GET', headers: { authorization: 'Bearer undefined' } }, res);
    expect(res.statusCode).toBe(401);
    errSpy.mockRestore();
  });
  it('401 on wrong bearer', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = mockRes();
    await cronHandler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res);
    expect(res.statusCode).toBe(401);
  });
  it('200 with cleared count on the happy path', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    sqlMock.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = mockRes();
    await cronHandler({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.cleared).toBe(2);
    logSpy.mockRestore();
  });
  it('503 db_retention_failed when UPDATE throws (db_* → 503 invariant)', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    sqlMock.mockRejectedValue(new Error('pooler reset'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await cronHandler({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, res);
    expect(res.statusCode).toBe(503);
    expect(errSpy.mock.calls.some(([m]) => String(m).includes('db_retention_failed'))).toBe(true);
    errSpy.mockRestore();
  });
});
