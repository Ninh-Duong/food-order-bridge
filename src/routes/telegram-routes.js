const express = require('express');
const router = express.Router();
const config = require('../config');
const telegramBotService = require('../services/telegram-bot-service');

router.post('/webhook', async (req, res) => {
  const configuredSecret = config.getTelegramWebhookSecret();
  if (configuredSecret) {
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (incomingSecret !== configuredSecret) {
      console.warn('[Telegram Webhook] Unauthorized request: Invalid secret token header');
      return res.status(403).json({ error: 'Forbidden: Invalid secret token' });
    }
  }

  const update = req.body;
  if (!update || typeof update !== 'object') {
    return res.status(400).json({ error: 'Bad Request: Missing update payload' });
  }

  // Respond to Telegram immediately with 200 OK
  res.status(200).json({ ok: true });

  // Process update asynchronously
  try {
    await telegramBotService.handleUpdate(update);
  } catch (err) {
    console.error('[Telegram Webhook Error]:', err.message);
  }
});

module.exports = router;
