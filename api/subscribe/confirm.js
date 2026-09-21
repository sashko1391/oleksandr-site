// Double opt-in, second half: GET shows a page with a button, POST is what actually confirms.
// A mail scanner that prefetches links must not be able to confirm a subscription on someone's
// behalf — that would quietly destroy the consent record the confirmation exists to create.
import { getSql } from '../../lib/db.js';
import { TokenInput } from '../../lib/schema.js';
import { jsonError, htmlPage } from '../../lib/http.js';
import { hashToken } from '../../lib/security.js';

const ACTION = '/api/subscribe/confirm';

/** The token of this request: the emailed link puts it in the query, our own form re-posts it. */
function tokenOf(req) {
  const fromBody = typeof req.body === 'object' && req.body ? req.body.token : undefined;
  const fromQuery = req.query?.token;
  return TokenInput.safeParse({ token: fromBody ?? fromQuery ?? '' });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  const parsed = tokenOf(req);
  if (!parsed.success) {
    return htmlPage({
      res,
      status: 400,
      title: 'Посилання не спрацювало',
      heading: 'Посилання не спрацювало',
      body: '<p>Схоже, адресу скопійовано не повністю. Відкрийте лист ще раз і натисніть кнопку в ньому.</p>',
    });
  }
  const { token } = parsed.data;

  // GET never changes anything: it only offers the button.
  if (req.method === 'GET') {
    return htmlPage({
      res,
      title: 'Підтвердження підписки',
      heading: 'Підтвердьте підписку',
      body: '<p>Залишився один крок — натисніть кнопку, і ви отримуватимете нові тексти з parkinsandr.tech.</p>',
      form:
        `<form method="post" action="${ACTION}">` +
        `<input type="hidden" name="token" value="${token.replace(/[^A-Za-z0-9_-]/g, '')}">` +
        `<button type="submit">Підтвердити підписку</button></form>`,
    });
  }

  // POST: single-use by construction — the token hash is cleared in the same statement that
  // confirms, so a second click (or a parallel one) updates nothing instead of writing twice.
  let row;
  try {
    const sql = getSql();
    const updated = await sql`
      UPDATE subscribers
      SET status = 'confirmed', confirmed_at = now(), confirm_token_hash = NULL
      WHERE confirm_token_hash = ${hashToken(token)} AND status = 'pending'
      RETURNING id`;
    row = updated[0];
  } catch (err) {
    return jsonError(res, 503, 'db_confirm_failed', err);
  }

  if (!row) {
    // Either confirmed already or the link expired — both are fine to say out loud, and neither
    // reveals whether the address exists.
    return htmlPage({
      res,
      title: 'Підписку вже підтверджено',
      heading: 'Схоже, все вже зроблено',
      body:
        '<p>Це посилання одноразове: або підписку вже підтверджено, або воно застаріло.</p>' +
        '<p class="muted">Якщо листи так і не приходять — підпишіться ще раз на сайті.</p>',
    });
  }

  console.log(JSON.stringify({ level: 'info', event: 'subscriber_confirmed', id: row.id }));
  return htmlPage({
    res,
    title: 'Підписку підтверджено',
    heading: 'Готово — підписку підтверджено',
    body:
      '<p>Дякую. Новий текст приходитиме коротким листом: заголовок, кілька речень і посилання.</p>' +
      '<p class="muted">Відписатися можна одним кліком з будь-якого листа.</p>',
  });
}
