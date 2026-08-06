const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading settings.json:', err.message);
  }
  return {};
}

function saveSettings(newSettings) {
  const current = loadSettings();
  const updated = { ...current, ...newSettings };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

const fileSettings = loadSettings();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SHOP_NAME: process.env.SHOP_NAME || fileSettings.shopName || 'Food Order Shop',
  ORDER_TIMEZONE: process.env.ORDER_TIMEZONE || fileSettings.timezone || 'Asia/Bangkok',
  
  getTelegramToken() {
    return process.env.TELEGRAM_BOT_TOKEN || loadSettings().telegramBotToken || '';
  },

  getTelegramChatId() {
    return process.env.TELEGRAM_CHAT_ID || loadSettings().telegramChatId || '';
  },

  loadSettings,
  saveSettings
};
