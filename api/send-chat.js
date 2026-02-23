export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { contact, history, timestamp } = req.body;

  if (!contact || !history) {
    return res.status(400).json({ error: 'Missing contact or history' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ error: 'Telegram secrets not configured' });
  }

  const date = timestamp
    ? new Date(timestamp).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })
    : new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

  const maxLen = 3000;
  const trimmed = history.length > maxLen
    ? history.slice(0, maxLen) + '\n\n... [обрізано]'
    : history;

  const message =
    `🆕 Новий лід з сайту!\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📅 ${date}\n` +
    `📞 Контакт: ${contact}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `💬 Історія чату:\n\n${trimmed}`;

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
      }
    );

    if (!tgRes.ok) {
      const err = await tgRes.text();
      return res.status(502).json({ error: 'Telegram error', details: err });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
