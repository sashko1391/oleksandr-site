// Telegram webhook: handles moderation button taps (approve / spam / delete).
import { getSql } from '../lib/db.js';
import { verifyAction } from '../lib/security.js';
import { answerCallback, editMessageText } from '../lib/telegram.js';

const ACTIONS = { a: 'approved', s: 'spam', d: 'deleted' };
const LABELS = { a: '✅ Схвалено', s: '🚫 Спам', d: '🗑 Видалено' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 1) shared-secret from Telegram setWebhook(secret_token)
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.TG_WEBHOOK_SECRET) {
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
  if (!chatOk || !userOk) {
    await answerCallback(cq.id, 'Немає доступу');
    return res.status(403).end();
  }

  // 3) parse + verify HMAC signature in callback_data
  const [action, idStr, sig] = String(cq.data || '').split(':');
  const id = Number(idStr);
  if (!(action in ACTIONS) || !Number.isInteger(id) || !verifyAction(action, id, sig)) {
    await answerCallback(cq.id, 'Некоректна дія');
    return res.status(200).json({ ok: false });
  }

  // 4) apply status change (idempotent: act only while still pending)
  const sql = getSql();
  const updated = await sql`
    UPDATE comments SET status = ${ACTIONS[action]}
    WHERE id = ${id} AND status = 'pending'
    RETURNING id`;

  const label = LABELS[action];
  await answerCallback(cq.id, updated.length ? label : 'Вже оброблено');
  if (cq.message) {
    const base = String(cq.message.text || `Коментар #${id}`);
    await editMessageText(cq.message.chat.id, cq.message.message_id, `${base}\n\n— <b>${label}</b>`);
  }
  return res.status(200).json({ ok: true });
}
