// Unsubscribe: GET shows a page with a button, POST removes the address from the list.
// Authorisation is the unguessable token itself, so this endpoint deliberately does NOT use the
// same-origin CSRF guard: a one-click POST from Gmail (RFC 8058) carries neither Origin nor our
// own header, and would be rejected by it. A bearer token cannot be forged by a third-party form.
import { getSql } from '../lib/db.js';
import { TokenInput } from '../lib/schema.js';
import { jsonError, htmlPage } from '../lib/http.js';
import { hashToken } from '../lib/security.js';

const ACTION = '/api/unsubscribe';

function tokenOf(req) {
  // RFC 8058 posts `List-Unsubscribe=One-Click` as the body, with the token still in the URL.
  const fromBody = typeof req.body === 'object' && req.body ? req.body.token : undefined;
  return TokenInput.safeParse({ token: fromBody ?? req.query?.token ?? '' });
}

/** A mail client's one-click POST wants a status code, not a page. */
const isOneClick = (req) =>
  typeof req.body === 'object' && req.body && req.body['List-Unsubscribe'] === 'One-Click';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  const parsed = tokenOf(req);
  if (!parsed.success) {
    if (req.method === 'POST' && isOneClick(req)) return res.status(400).json({ error: 'invalid token' });
    return htmlPage({
      res,
      status: 400,
      title: 'Посилання не спрацювало',
      heading: 'Посилання не спрацювало',
      body: '<p>Схоже, адресу скопійовано не повністю. Відкрийте лист ще раз і натисніть посилання в ньому.</p>',
    });
  }
  const { token } = parsed.data;

  if (req.method === 'GET') {
    return htmlPage({
      res,
      title: 'Відписка',
      heading: 'Відписатися від листів?',
      body: '<p>Після цього листів не буде. Тексти лишаться на сайті, у RSS і в Telegram-каналі.</p>',
      form:
        `<form method="post" action="${ACTION}">` +
        `<input type="hidden" name="token" value="${token.replace(/[^A-Za-z0-9_-]/g, '')}">` +
        `<button type="submit">Так, відписатися</button></form>`,
    });
  }

  // Idempotent: the token hash is never cleared, because archived letters still link it. A second
  // unsubscribe simply finds the row already unsubscribed and says the same thing.
  let row;
  try {
    const sql = getSql();
    const updated = await sql`
      UPDATE subscribers
      SET status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
      WHERE unsubscribe_token_hash = ${hashToken(token)}
      RETURNING id`;
    row = updated[0];
  } catch (err) {
    return jsonError(res, 503, 'db_unsubscribe_failed', err);
  }

  if (isOneClick(req)) return res.status(200).json({ ok: true });

  if (!row) {
    return htmlPage({
      res,
      title: 'Посилання не знайдено',
      heading: 'Такого посилання не знайшлося',
      body: '<p>Можливо, адресу вже видалено з бази. Листів у будь-якому разі не буде.</p>',
    });
  }
  console.log(JSON.stringify({ level: 'info', event: 'subscriber_unsubscribed', id: row.id }));
  return htmlPage({
    res,
    title: 'Відписано',
    heading: 'Готово — листів більше не буде',
    body:
      '<p>Дякую, що читали. Якщо передумаєте, підписка є на сайті.</p>' +
      '<p class="muted">Тексти й далі виходять у RSS і в Telegram-каналі.</p>',
  });
}
