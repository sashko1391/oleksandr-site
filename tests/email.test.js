// lib/email.js against a mocked fetch: the transport itself was invisible to the handler tests,
// because they mock sendEmail away. Every field Resend needs is asserted here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail, confirmEmail, FROM, REPLY_TO, esc } from '../lib/email.js';

const okResponse = () => ({ ok: true, status: 200, json: async () => ({ id: 'e-1' }) });

let fetchMock;
beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  fetchMock = vi.fn().mockResolvedValue(okResponse());
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const msg = () => ({ to: 'reader@example.com', subject: 'S', html: '<b>H</b>', text: 'T' });

describe('sendEmail', () => {
  it('authenticates, addresses and sets a reply-to the reader can answer', async () => {
    await sendEmail(msg());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: FROM, to: ['reader@example.com'], subject: 'S', reply_to: REPLY_TO });
    expect(body.html).toBe('<b>H</b>');
    expect(body.text, 'a plain-text part keeps us out of spam filters').toBe('T');
  });

  it('gives up rather than hanging a serverless function', async () => {
    await sendEmail(msg());
    expect(fetchMock.mock.calls[0][1].signal, 'no timeout on the send').toBeInstanceOf(AbortSignal);
  });

  it('passes an idempotency key only when given one', async () => {
    await sendEmail({ ...msg(), idempotencyKey: 'confirm:42:abc' });
    expect(fetchMock.mock.calls[0][1].headers['idempotency-key']).toBe('confirm:42:abc');
    await sendEmail(msg());
    expect(fetchMock.mock.calls[1][1].headers['idempotency-key']).toBeUndefined();
  });

  it('throws on an HTTP error, on an { error } body and on unparsable JSON', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ error: 'bad' }) });
    await expect(sendEmail(msg())).rejects.toThrow(/resend_failed:422/);
    // Resend answers 200 with an error object in some cases — that is still a failure
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ error: { message: 'nope' } }) });
    await expect(sendEmail(msg())).rejects.toThrow(/resend_failed/);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('not json'); } });
    await expect(sendEmail(msg())).rejects.toThrow(/resend_failed/);
  });

  it('refuses to pretend it can send without a key', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendEmail(msg())).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never puts the key or the address into the error it throws', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(sendEmail(msg())).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('test-key') })
    );
  });
});

describe('confirmEmail', () => {
  it('carries the link in both parts and escapes what goes into HTML', async () => {
    const { subject, html, text } = confirmEmail({
      confirmUrl: 'https://www.parkinsandr.tech/api/subscribe/confirm/?token=a&b',
      topics: ['parkinson'],
    });
    expect(subject).toBeTruthy();
    expect(html).toContain('a&amp;b'); // escaped
    expect(text).toContain('token=a&b'); // raw in the plain-text part
    expect(html).toContain('parkinson');
    expect(esc('<x>&"')).toBe('&lt;x&gt;&amp;&quot;');
  });

  it('says what happens if it was not you — the letter must not read as a subscription already made', () => {
    const { html, text } = confirmEmail({ confirmUrl: 'https://x/', topics: [] });
    for (const part of [html, text]) {
      expect(part).toMatch(/не ви/);
      expect(part).toMatch(/7 днів/);
    }
  });
});
