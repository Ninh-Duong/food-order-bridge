const express = require('express');
const router = express.Router();
const config = require('../config');
const telegramBotService = require('../services/telegram-bot-service');
const tenantTelegramBotService = require('../services/tenant-telegram-bot-service');
const { getEffectiveSettings } = require('../services/tenant-telegram-settings-service');

router.post('/webhook/:storeId', async (req, res) => {
  const storeId = String(req.params.storeId || '').trim();
  const branchId = req.query.branchId ? String(req.query.branchId).trim() : null;
  try {
    const settings = await getEffectiveSettings({ storeId, branchId });
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (settings.webhookSecret && incomingSecret !== settings.webhookSecret) {
      return res.status(403).json({ error: 'Forbidden: Invalid tenant webhook secret' });
    }
    if (settings.token && req.headers['x-telegram-bot-api-secret-token'] === undefined && settings.webhookSecret) {
      return res.status(403).json({ error: 'Forbidden: Missing tenant webhook secret' });
    }
    const update = req.body;
    if (!update || typeof update !== 'object') return res.status(400).json({ error: 'Bad Request: Missing update payload' });
    res.status(200).json({ ok: true });
    await tenantTelegramBotService.handleUpdate(update, { storeId, branchId });
  } catch (err) {
    console.error(`[Telegram Tenant Webhook ${storeId}]`, err.message);
    if (!res.headersSent) return res.status(400).json({ error: err.message });
  }
});

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
