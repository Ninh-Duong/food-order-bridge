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

  getTelegramAdminUserIds() {
    const raw = process.env.TELEGRAM_ADMIN_USER_IDS || loadSettings().telegramAdminUserIds || '';
    if (Array.isArray(raw)) {
      return raw.map(id => String(id).trim()).filter(Boolean);
    }
    return String(raw)
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  },

  getTelegramWebhookSecret() {
    return process.env.TELEGRAM_WEBHOOK_SECRET || loadSettings().telegramWebhookSecret || '';
  },

  getPublicBaseUrl() {
    return process.env.PUBLIC_BASE_URL || loadSettings().publicBaseUrl || '';
  },

  isTelegramOrderNotificationEnabled() {
    return String(
      process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED || 'false'
    ).toLowerCase() === 'true';
  },

  getLowStockThreshold() {
    const val = process.env.LOW_STOCK_THRESHOLD ?? loadSettings().lowStockThreshold;
    const parsed = Number(val);
    return isNaN(parsed) || parsed < 0 ? 5 : parsed;
  },

  getPaymentMockEnabled() {
    const raw = process.env.PAYMENT_MOCK_ENABLED;
    if (raw !== undefined) return String(raw).toLowerCase() === 'true';
    return this.NODE_ENV !== 'production';
  },

  getPaymentPendingOrderLimit() {
    const raw = process.env.PAYMENT_PENDING_ORDER_LIMIT;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 3;
  },

  getPaymentPendingTimeoutMinutes() {
    const raw = process.env.PAYMENT_PENDING_TIMEOUT_MINUTES;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 5;
  },

  getPaymentPendingScope() {
    const raw = String(process.env.PAYMENT_PENDING_SCOPE || 'ALL').toUpperCase();
    return raw === 'ALL' ? 'ALL' : 'DINE_IN';
  },

  getPaymentCapacityAlertCooldownMinutes() {
    const raw = process.env.PAYMENT_CAPACITY_ALERT_COOLDOWN_MINUTES;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 5;
  },

  getReportScheduleEnabled() {
    const raw = process.env.REPORT_SCHEDULE_ENABLED;
    if (raw === undefined) return false;
    return String(raw).toLowerCase() === 'true';
  },

  getReportScheduleTimes() {
    return {
      daily: process.env.REPORT_DAILY_TIME || '23:59',
      weekly: process.env.REPORT_WEEKLY_TIME || '00:05',
      monthly: process.env.REPORT_MONTHLY_TIME || '00:10'
    };
  },

  getReportChartEnabled() {
    const raw = process.env.REPORT_CHART_ENABLED;
    if (raw === undefined) return true;
    return String(raw).toLowerCase() === 'true';
  },

  getReportChartBaseUrl() {
    return process.env.REPORT_CHART_BASE_URL || 'https://quickchart.io/chart';
  },

  getReportChartWidth() {
    const parsed = Number.parseInt(process.env.REPORT_CHART_WIDTH, 10);
    return Number.isInteger(parsed) && parsed >= 400 ? parsed : 900;
  },

  getReportChartHeight() {
    const parsed = Number.parseInt(process.env.REPORT_CHART_HEIGHT, 10);
    return Number.isInteger(parsed) && parsed >= 250 ? parsed : 450;
  },

  getMomoConfig() {
    return {
      partnerCode: process.env.MOMO_PARTNER_CODE || '',
      accessKey: process.env.MOMO_ACCESS_KEY || '',
      secretKey: process.env.MOMO_SECRET_KEY || '',
      apiBaseUrl: process.env.MOMO_API_BASE_URL || 'https://test-payment.momo.vn',
      ipnUrl: process.env.MOMO_IPN_URL || '',
      redirectUrl: process.env.MOMO_REDIRECT_URL || this.getPublicBaseUrl()
    };
  },

  getBankQrConfig() {
    return {
      bankCode: process.env.BANK_QR_BANK_CODE || '',
      accountNumber: process.env.BANK_QR_ACCOUNT_NUMBER || '',
      accountName: process.env.BANK_QR_ACCOUNT_NAME || ''
    };
  },

  loadSettings,
  saveSettings
};

