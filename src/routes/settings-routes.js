const express = require('express');
const router = express.Router();
const config = require('../config');
const telegramClient = require('../integrations/telegram-client');

// GET /api/settings - Get settings (masked tokens for security)
router.get('/', (req, res) => {
  const token = config.getTelegramToken();
  const chatId = config.getTelegramChatId();
  const secret = config.getTelegramWebhookSecret();
  const adminUserIds = config.getTelegramAdminUserIds();

  res.json({
    telegramBotToken: token ? `${token.substring(0, 6)}...${token.substring(token.length - 4)}` : '',
    telegramChatId: chatId,
    telegramAdminUserIds: adminUserIds.join(','),
    telegramWebhookSecret: secret ? `${secret.substring(0, 4)}...` : '',
    publicBaseUrl: config.getPublicBaseUrl(),
    lowStockThreshold: config.getLowStockThreshold(),
    shopName: config.SHOP_NAME
  });
});

// POST /api/settings - Update Telegram settings
router.post('/', (req, res) => {
  try {
    const {
      telegramBotToken,
      telegramChatId,
      telegramAdminUserIds,
      telegramWebhookSecret,
      publicBaseUrl,
      lowStockThreshold
    } = req.body;
    
    const newSettings = {};
    if (telegramBotToken && !telegramBotToken.includes('...')) {
      newSettings.telegramBotToken = telegramBotToken;
    }
    if (telegramChatId !== undefined) {
      newSettings.telegramChatId = telegramChatId;
    }
    if (telegramAdminUserIds !== undefined) {
      newSettings.telegramAdminUserIds = telegramAdminUserIds;
    }
    if (telegramWebhookSecret && !telegramWebhookSecret.includes('...')) {
      newSettings.telegramWebhookSecret = telegramWebhookSecret;
    }
    if (publicBaseUrl !== undefined) {
      newSettings.publicBaseUrl = publicBaseUrl;
    }
    if (lowStockThreshold !== undefined) {
      newSettings.lowStockThreshold = Number(lowStockThreshold);
    }

    config.saveSettings(newSettings);
    res.json({ message: 'Đã lưu cấu hình thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lưu cấu hình' });
  }
});

// POST /api/settings/test - Test send message to Telegram group
router.post('/test', async (req, res) => {
  try {
    const testMsg = `🤖 TEST KẾT NỐI TELEGRAM BOT\n\nChúc mừng! Bot Telegram của bạn đã kết nối thành công với cửa hàng ${config.SHOP_NAME}.\nThời gian: ${new Date().toLocaleString('vi-VN')}`;
    const result = await telegramClient.sendTelegramMessage(testMsg);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/settings/telegram/webhook-status - Get current Telegram webhook status
router.get('/telegram/webhook-status', async (req, res) => {
  try {
    const info = await telegramClient.getWebhookInfo();
    res.json({ ok: true, webhookInfo: info });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/settings/telegram/register-webhook - Register webhook with Telegram API
router.post('/telegram/register-webhook', async (req, res) => {
  try {
    const baseUrl = (req.body.publicBaseUrl || config.getPublicBaseUrl() || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      return res.status(400).json({ message: 'Thiếu PUBLIC_BASE_URL (Ví dụ: https://food-order-bridge.onrender.com)' });
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    const secret = config.getTelegramWebhookSecret();

    const result = await telegramClient.setWebhook(webhookUrl, secret);
    res.json({
      ok: true,
      message: `Đã đăng ký Webhook thành công với Telegram!`,
      webhookUrl,
      result
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

