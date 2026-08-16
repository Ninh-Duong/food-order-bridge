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

async function callTelegramApi(endpoint, body, tokenOverride = '') {
  const token = tokenOverride || config.getTelegramToken();
  if (!token) {
    throw new Error('Telegram Bot Token chưa được cấu hình.');
  }

  const url = `https://api.telegram.org/bot${token}/${endpoint}`;
  let attempt = 0;
  let delay = 1000;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        return data.result;
      }

      const status = response.status;
      const description = data.description || 'Unknown Telegram Error';

      if (status === 400 || status === 401 || status === 403) {
        throw new Error(`Telegram API Error (${status}): ${description}`);
      }

      if (status === 429) {
        const retryAfter = (data.parameters && data.parameters.retry_after) || 3;
        console.warn(`[Telegram Rate Limit 429] Waiting ${retryAfter}s before retrying...`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
      } else if (attempt <= MAX_RETRIES) {
        console.warn(`[Telegram Retrying Attempt ${attempt}/${MAX_RETRIES}] waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay = 3000;
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

      if (attempt > MAX_RETRIES || err.message.includes('Telegram API Error')) {
        throw err;
      }
      await new Promise(r => setTimeout(r, delay));
      delay = 3000;
    }
  }

  throw new Error(`Telegram request to ${endpoint} failed.`);
}

function splitTelegramMessage(text, maxLength = 4000) {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

async function sendTelegramMessage(payloadOrText) {
  let targetChatId = config.getTelegramChatId();
  let telegramConfig = null;
  let text = '';
  let parseMode;
  let replyMarkup;

  if (typeof payloadOrText === 'string') {
    text = payloadOrText;
  } else if (payloadOrText && typeof payloadOrText === 'object') {
    targetChatId = payloadOrText.chatId || payloadOrText.chat_id || targetChatId;
    telegramConfig = payloadOrText.telegramConfig || null;
    text = payloadOrText.text || '';
    parseMode = payloadOrText.parseMode || payloadOrText.parse_mode;
    replyMarkup = payloadOrText.replyMarkup || payloadOrText.reply_markup;
  }

  if (!targetChatId) {
    throw new Error('Telegram Chat ID chưa được cấu hình.');
  }

  const chunks = splitTelegramMessage(text);
  let lastResult = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const isLast = i === chunks.length - 1;
    const body = {
      chat_id: targetChatId,
      text: chunkText
    };

    if (parseMode) body.parse_mode = parseMode;
    if (isLast && replyMarkup) body.reply_markup = replyMarkup;

    const result = await callTelegramApi('sendMessage', body, telegramConfig?.token || telegramConfig?.botToken);
    lastResult = {
      ok: true,
      messageId: result.message_id
    };
  }

  return lastResult;
}

async function sendTelegramPhoto(payload) {
  const targetChatId = payload?.chatId || payload?.chat_id || config.getTelegramChatId();
  if (!targetChatId) throw new Error('Telegram Chat ID chưa được cấu hình.');
  if (!payload?.photo) throw new Error('Telegram photo URL chưa được cấu hình.');

  const body = {
    chat_id: targetChatId,
    photo: payload.photo
  };
  if (payload.caption) body.caption = payload.caption;
  if (payload.parseMode || payload.parse_mode) body.parse_mode = payload.parseMode || payload.parse_mode;
  if (payload.replyMarkup || payload.reply_markup) body.reply_markup = payload.replyMarkup || payload.reply_markup;

  const result = await callTelegramApi('sendPhoto', body, payload?.telegramConfig?.token || payload?.telegramConfig?.botToken);
  return { ok: true, messageId: result.message_id };
}

async function answerCallbackQuery(options) {
  const body = {
    callback_query_id: typeof options === 'string' ? options : options.callbackQueryId,
    text: typeof options === 'object' ? options.text : undefined,
    show_alert: typeof options === 'object' ? options.showAlert : undefined
  };
  return callTelegramApi('answerCallbackQuery', body, options?.telegramConfig?.token || options?.telegramConfig?.botToken);
}

async function editMessageText(options) {
  const body = {
    chat_id: options.chatId,
    message_id: options.messageId,
    text: options.text
  };
  if (options.parseMode) body.parse_mode = options.parseMode;
  if (options.replyMarkup) body.reply_markup = options.replyMarkup;

  const result = await callTelegramApi('editMessageText', body, options?.telegramConfig?.token || options?.telegramConfig?.botToken);
  return { ok: true, messageId: result.message_id };
}

async function setWebhook(webhookUrl, secretToken, telegramConfig = null) {
  const body = { url: webhookUrl };
  if (secretToken) body.secret_token = secretToken;
  return callTelegramApi('setWebhook', body, telegramConfig?.token || telegramConfig?.botToken);
}

async function deleteWebhook(telegramConfig = null) {
  return callTelegramApi('deleteWebhook', {}, telegramConfig?.token || telegramConfig?.botToken);
}

async function getWebhookInfo(telegramConfig = null) {
  return callTelegramApi('getWebhookInfo', {}, telegramConfig?.token || telegramConfig?.botToken);
}

module.exports = {
  sendTelegramMessage,
  sendTelegramPhoto,
  answerCallbackQuery,
  editMessageText,
  setWebhook,
  deleteWebhook,
  getWebhookInfo,
  splitTelegramMessage
};

