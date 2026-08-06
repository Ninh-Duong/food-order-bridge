const config = require('../config');

const TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function sendTelegramMessage(text) {
  const token = config.getTelegramToken();
  const chatId = config.getTelegramChatId();

  if (!token || !chatId) {
    throw new Error('Telegram Bot Token hoặc Chat ID chưa được cấu hình.');
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text
    // parse_mode is intentionally omitted for stability with raw user names/notes
  };

  let attempt = 0;
  let delay = 1000;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        return {
          ok: true,
          messageId: data.result.message_id
        };
      }

      const status = response.status;
      const description = data.description || 'Unknown Telegram Error';

      // 400, 401, 403 non-retryable errors
      if (status === 400 || status === 401 || status === 403) {
        throw new Error(`Telegram API Non-retryable Error (${status}): ${description}`);
      }

      if (status === 429) {
        const retryAfter = (data.parameters && data.parameters.retry_after) || 3;
        console.warn(`[Telegram Rate Limit 429] Waiting ${retryAfter}s before retrying...`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
      } else if (attempt <= MAX_RETRIES) {
        console.warn(`[Telegram Retrying Attempt ${attempt}/${MAX_RETRIES}] waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay = 3000; // 2nd retry wait 3s
      } else {
        throw new Error(`Telegram API Failure after retries (${status}): ${description}`);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt <= MAX_RETRIES) {
          console.warn(`[Telegram Timeout] Attempt ${attempt} timed out after ${TIMEOUT_MS}ms. Retrying...`);
          await new Promise(r => setTimeout(r, delay));
          delay = 3000;
          continue;
        }
        throw new Error(`Telegram Request Timeout after ${TIMEOUT_MS}ms`);
      }

      if (attempt > MAX_RETRIES || err.message.includes('Non-retryable')) {
        throw err;
      }
      await new Promise(r => setTimeout(r, delay));
      delay = 3000;
    }
  }

  throw new Error('Telegram notification failed.');
}

module.exports = {
  sendTelegramMessage
};
