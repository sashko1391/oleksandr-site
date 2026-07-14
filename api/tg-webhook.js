// Telegram webhook: handles moderation button taps (approve / spam / delete).
import { getSql } from '../lib/db.js';
import { verifyAction, safeEqual } from '../lib/security.js';
import { answerCallback, editMessageText } from '../lib/telegram.js';
import { jsonError } from '../lib/http.js';

const ACTIONS = { a: 'approved', s: 'spam', d: 'deleted' };
const LABELS = { a: '✅ Схвалено', s: '🚫 Спам', d: '🗑 Видалено' };

/**
 * Telegram replies are best-effort: a failed answerCallback/editMessageText
 * must not turn an applied moderation action into a webhook error (retry storm).
 * @param {() => Promise<unknown>} fn
 */
async function tgReply(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'tg_webhook_reply_failed', msg: String(err) }));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 1) shared-secret from Telegram setWebhook(secret_token), constant-time
  if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], process.env.TG_WEBHOOK_SECRET)) {
    return res.status(401).end();
  }

  const update = typeof req.body === 'object' && req.body ? req.body : {};
  const cq = update.callback_query;
  if (!cq) return res.status(200).json({ ok: true }); // ignore non-callback updates

  // 2) admin allowlist — only the owner's private chat may moderate
  const adminChat = String(process.env.TELEGRAM_CHAT_ID);
  const adminUser = process.env.TELEGRAM_ADMIN_USER_ID;
  const chatOk = String(cq.message?.chat?.id) === adminChat;
  const userOk = !adminUser || String(cq.from?.id) === String(adminUser);
  // 200 (not 403): the update was delivered and rejected — a non-2xx would make
  // Telegram redeliver the same unauthorized tap over and over.
  if (!chatOk || !userOk) {
    await tgReply(() => answerCallback(cq.id, 'Немає доступу'));
    return res.status(200).json({ ok: false });
  }

  // 3) parse + verify HMAC signature in callback_data
  const [action, idStr, sig] = String(cq.data || '').split(':');
  const id = Number(idStr);
  if (!(action in ACTIONS) || !Number.isInteger(id) || !verifyAction(action, id, sig)) {
    await tgReply(() => answerCallback(cq.id, 'Некоректна дія'));
    return res.status(200).json({ ok: false });
  }

  // 4) apply status change (idempotent: act only while still pending).
  // On DB error reply 503 so Telegram retries — the UPDATE is retry-safe.
  let updated;
  try {
    const sql = getSql();
    updated = await sql`
      UPDATE comments SET status = ${ACTIONS[action]}
      WHERE id = ${id} AND status = 'pending'
      RETURNING id`;
  } catch (err) {
    await tgReply(() => answerCallback(cq.id, 'Помилка БД, спробуйте ще раз'));
    return jsonError(res, 503, 'db_tg_update_failed', err);
  }

  const label = LABELS[action];
  await tgReply(() => answerCallback(cq.id, updated.length ? label : 'Вже оброблено'));
  if (cq.message) {
    const base = String(cq.message.text || `Коментар #${id}`);
    await tgReply(() =>
      editMessageText(cq.message.chat.id, cq.message.message_id, `${base}\n\n— <b>${label}</b>`)
    );
  }
  return res.status(200).json({ ok: true });
}
