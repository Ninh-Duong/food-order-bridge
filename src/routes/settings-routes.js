const express = require('express');
const router = express.Router();
const config = require('../config');
const { sendTelegramMessage } = require('../integrations/telegram-client');

// GET /api/settings - Get settings (masked token for security)
router.get('/', (req, res) => {
  const token = config.getTelegramToken();
  const chatId = config.getTelegramChatId();

  res.json({
    telegramBotToken: token ? `${token.substring(0, 6)}...${token.substring(token.length - 4)}` : '',
    telegramChatId: chatId,
    shopName: config.SHOP_NAME
  });
});

// POST /api/settings - Update Telegram settings
router.post('/', (req, res) => {
  try {
    const { telegramBotToken, telegramChatId } = req.body;
    
    // Don't overwrite if input is masked string
    const newSettings = {};
    if (telegramBotToken && !telegramBotToken.includes('...')) {
      newSettings.telegramBotToken = telegramBotToken;
    }
    if (telegramChatId) {
      newSettings.telegramChatId = telegramChatId;
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
    const result = await sendTelegramMessage(testMsg);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
