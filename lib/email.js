// Transactional email through Resend. Same shape as lib/telegram.js: an HTTP error or an
// { error } body both throw, so callers' try/catch actually sees a failed send.
const API = 'https://api.resend.com/emails';

/** Who the list writes as. The subdomain keeps list mail away from the root domain's reputation. */
export const FROM = 'Олександр Кравченко <news@send.parkinsandr.tech>';
export const REPLY_TO = 'sashko1391@gmail.com';

/**
 * @param {{ to: string, subject: string, html: string, text: string, headers?: Record<string,string>,
 *           idempotencyKey?: string }} msg
 * @returns {Promise<{ id?: string }>}
 */
export async function sendEmail({ to, subject, html, text, headers, idempotencyKey }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      // A deterministic key makes a retry after a crash-before-ack a no-op on Resend's side.
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
      text,
      reply_to: REPLY_TO,
      ...(headers ? { headers } : {}),
    }),
    signal: AbortSignal.timeout(8000), // don't hang serverless on a slow provider
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) throw new Error(`resend_failed:${res.status}`);
  return data;
}

/** Escape text going into our own HTML email templates. */
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SHELL = (body) => `<!doctype html><html lang="uk"><body style="margin:0;padding:24px;background:#F5F0EA;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">${body}</div></body></html>`;

const BUTTON = (href, label) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="display:inline-block;background:#1B3A5C;color:#F5F0EA;
text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600">${esc(label)}</a></p>`;

/**
 * The double opt-in email. The link opens a page with a button: a mail scanner that prefetches the
 * URL must not be able to confirm a subscription nobody asked for.
 * @param {{ confirmUrl: string, topics: string[] }} p
 */
export function confirmEmail({ confirmUrl, topics }) {
  const what = topics.length ? `Розділи: ${topics.join(', ')}.` : 'Усі нові тексти.';
  const html = SHELL(
    `<h1 style="font-size:22px;margin:0 0 16px">Підтвердьте підписку</h1>
<p style="margin:0">Хтось (сподіваюся, ви) підписав цю адресу на листи з parkinsandr.tech. ${esc(what)}</p>
${BUTTON(confirmUrl, 'Підтвердити підписку')}
<p style="margin:0;color:#555;font-size:14px">Якщо це були не ви — просто не натискайте кнопку, і ми більше не напишемо.
Посилання діє 7 днів.</p>
<p style="margin:24px 0 0;color:#555;font-size:14px">Олександр Кравченко · parkinsandr.tech</p>`
  );
  const text = `Підтвердьте підписку на листи з parkinsandr.tech. ${what}\n\n${confirmUrl}\n\nЯкщо це були не ви — просто проігноруйте цей лист. Посилання діє 7 днів.\n\nОлександр Кравченко · parkinsandr.tech`;
  return { subject: 'Підтвердьте підписку — parkinsandr.tech', html, text };
}
