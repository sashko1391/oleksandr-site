// The newsletter fan-out: who gets a letter, in what order the database and the provider are touched,
// and what happens when a send fails. DB and Resend are mocked; the token helpers stay real.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const sqlMock = vi.fn();
vi.mock('../lib/db.js', () => ({ getSql: () => sqlMock }));

const sendEmailMock = vi.fn();
vi.mock('../lib/email.js', async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, sendEmail: (...a) => sendEmailMock(...a) };
});

import { sendEmails, sectionOf } from '../scripts/announce.mjs';
import { hashToken, unsubToken, hashEmail } from '../lib/security.js';

const ITEM = {
  title: 'Говерла: як я таки зійшов на вершину',
  description: 'Підйом з хворобою Паркінсона.',
  link: 'https://www.parkinsandr.tech/journal/hoverla/',
};

const person = (id, extra = {}) => {
  const emailHash = hashEmail(`reader${id}@example.com`);
  return {
    id,
    email: `reader${id}@example.com`,
    email_hash: emailHash,
    unsubscribe_token_hash: hashToken(unsubToken(emailHash)),
    ...extra,
  };
};

/** Route sql`…`: SELECT subscribers → people, SELECT deliveries → already-sent ids, writes → ok. */
function routeSql({ people = [person(1)], alreadySent = [] } = {}) {
  sqlMock.mockImplementation(async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM subscribers')) return people;
    if (q.includes('FROM announcement_deliveries')) {
      return alreadySent.includes(values[1]) ? [{ one: 1 }] : [];
    }
    if (q.includes('INSERT INTO announcement_deliveries')) return [{ subscriber_id: values[1] }];
    return [];
  });
}

const queries = () => sqlMock.mock.calls.map((c) => c[0].join('?'));
const callOrder = () => {
  const order = [];
  for (const c of sqlMock.mock.calls) order.push(c[0].join(' '));
  return order;
};

beforeAll(() => {
  process.env.EMAIL_HASH_SECRET = 'test-email-secret';
  process.env.DATABASE_URL = 'postgres://test';
  process.env.RESEND_API_KEY = 'test';
});

beforeEach(() => {
  vi.clearAllMocks();
  sendEmailMock.mockResolvedValue({ id: 'resend-1' });
  routeSql();
});

describe('sectionOf', () => {
  it('maps a post to the section people can subscribe to', () => {
    expect(sectionOf('journal/hoverla')).toEqual({ topic: 'parkinson', name: 'Паркінсон' });
    expect(sectionOf('blog/jarvis-ai-assistant')).toEqual({ topic: 'code', name: 'Код' });
  });
  it('returns null for a section with no mailing list', () => {
    expect(sectionOf('blog/react-vs-tilda'), '/services/ posts are not newsletter material').toBeNull();
    expect(sectionOf('journal/nope')).toBeNull();
  });
});

describe('sendEmails', () => {
  it('refuses a post nobody can be subscribed to', async () => {
    await expect(sendEmails('blog/react-vs-tilda', ITEM, { pace: 0 })).rejects.toThrow(/no section/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('asks only for confirmed subscribers of this section (or of everything)', async () => {
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    const select = queries().find((q) => q.includes('FROM subscribers'));
    expect(select).toContain("status = 'confirmed'");
    expect(select).toContain('email IS NOT NULL');
    expect(select).toContain("topics = '{}'::text[] OR");
    expect(sqlMock.mock.calls[0].slice(1)).toContain('parkinson');
  });

  it('claims the recipient BEFORE the send, then records the result', async () => {
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    const order = callOrder();
    const claimAt = order.findIndex((q) => q.includes('INSERT INTO announcement_deliveries'));
    const markAt = order.findIndex((q) => q.includes("SET status = 'sent'"));
    expect(claimAt).toBeGreaterThanOrEqual(0);
    expect(markAt).toBeGreaterThan(claimAt);
    // the claim must not overwrite a row that is already sent
    expect(order[claimAt]).toContain("announcement_deliveries.status <> 'sent'");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('sends with a key that makes a retry a no-op on the provider', async () => {
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    expect(sendEmailMock.mock.calls[0][0].idempotencyKey).toBe('announce:journal/hoverla:1');
  });

  it('puts a working one-click unsubscribe in the letter — headers and body', async () => {
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    const letter = sendEmailMock.mock.calls[0][0];
    const token = decodeURIComponent(letter.text.match(/token=([^\s]+)/)[1]);
    // the raw token exists only in this letter; the database can verify it by hash
    expect(hashToken(token)).toBe(person(1).unsubscribe_token_hash);
    expect(letter.headers['List-Unsubscribe']).toContain(token);
    expect(letter.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(letter.html).toContain('Відписатися одним кліком');
  });

  it('repairs a subscriber whose stored hash predates the deterministic token', async () => {
    routeSql({ people: [person(1, { unsubscribe_token_hash: 'legacy-random-hash' })] });
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    const fix = queries().find((q) => q.includes('SET unsubscribe_token_hash'));
    expect(fix, 'otherwise that person could never unsubscribe').toBeTruthy();
    const letter = sendEmailMock.mock.calls[0][0];
    const token = decodeURIComponent(letter.text.match(/token=([^\s]+)/)[1]);
    expect(hashToken(token)).toBe(hashToken(unsubToken(person(1).email_hash)));
  });

  it('does not send when the claim finds the row already sent (a parallel run won)', async () => {
    sqlMock.mockImplementation(async (strings) => {
      const q = strings.join(' ');
      if (q.includes('FROM subscribers')) return [person(1)];
      if (q.includes('FROM announcement_deliveries')) return []; // the scan saw nothing sent…
      if (q.includes('INSERT INTO announcement_deliveries')) return []; // …but the claim lost the race
      return [];
    });
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    expect(sendEmailMock, 'an unclaimed recipient must not get a second letter').not.toHaveBeenCalled();
  });

  it('skips whoever already received this post', async () => {
    routeSql({ people: [person(1), person(2)], alreadySent: [1] });
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('reader2@example.com');
  });

  it('records a failure and keeps going with the rest', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    routeSql({ people: [person(1), person(2)] });
    sendEmailMock.mockRejectedValueOnce(new Error('resend_failed:429'));
    await sendEmails('journal/hoverla', ITEM, { pace: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(queries().some((q) => q.includes("SET status = 'failed'"))).toBe(true);
    err.mockRestore();
  });

  it('stops at the per-run limit instead of blowing the daily quota', async () => {
    routeSql({ people: [person(1), person(2), person(3)] });
    await sendEmails('journal/hoverla', ITEM, { limit: 2, pace: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it('--dry writes nothing and sends nothing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmails('journal/hoverla', ITEM, { dry: true, pace: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(queries().some((q) => q.includes('INSERT') || q.includes('UPDATE'))).toBe(false);
    log.mockRestore();
  });
});
