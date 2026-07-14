// Minimal Telegram Bot API helpers (same bot as the site's chat/lead Cloudflare Worker).
const API = (method) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

/**
 * Telegram reports failures both as HTTP errors and as { ok: false } bodies —
 * treat both as throws so callers' local try/catch actually sees them.
 * @param {string} method
 * @param {Record<string, unknown>} payload
 * @returns {Promise<any>}
 */
async function call(method, payload) {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000), // don't hang serverless on a slow Telegram
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(`telegram_api_failed:${method}:${res.status}`);
  }
  return data;
}

/**
 * @param {string} text HTML
 * @param {Array<Array<{ text: string, callback_data: string }>>} [inlineKeyboard]
 */
export function sendMessage(text, inlineKeyboard) {
  return call('sendMessage', {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
  });
}

/** @param {string} callbackQueryId @param {string} [text] */
export function answerCallback(callbackQueryId, text) {
  return call('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

/** @param {number|string} chatId @param {number} messageId @param {string} text HTML */
export function editMessageText(chatId, messageId, text) {
  return call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}
