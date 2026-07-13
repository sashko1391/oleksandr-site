// Minimal Telegram Bot API helpers (reuses the same bot as api/send-chat.js).
const API = (method) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

/**
 * @param {string} method
 * @param {Record<string, unknown>} payload
 * @returns {Promise<any>}
 */
async function call(method, payload) {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
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
