const config = require('../config');
const telegramClient = require('../integrations/telegram-client');
const reportService = require('./report-service');
const menuService = require('./menu-service');
const {
  formatSalesReport,
  formatInventoryReport,
  buildMenuReplyMarkup,
  escapeHtml
} = require('./telegram-report-formatter');

class TelegramBotService {
  isAuthorized(userId) {
    if (!userId) return false;
    const adminIds = config.getTelegramAdminUserIds();
    
    // If explicit admin IDs are set, strictly check against them
    if (adminIds.length > 0) {
      return adminIds.includes(String(userId).trim());
    }

    // Fallback: If no ADMIN_USER_IDS set, compare with main CHAT_ID if it matches
    const mainChatId = config.getTelegramChatId();
    if (mainChatId && String(mainChatId).trim() === String(userId).trim()) {
      return true;
    }

    return false;
  }

  async sendUnauthorizedNotice(chatId, userId) {
    const text = `⛔ <b>Bạn không có quyền xem báo cáo của cửa hàng.</b>\n\nTelegram User ID của bạn: <code>${escapeHtml(userId)}</code>\n\n<i>Hãy thêm ID này vào cấu hình TELEGRAM_ADMIN_USER_IDS trên hệ thống để cấp quyền.</i>`;
    return telegramClient.sendTelegramMessage({
      chatId,
      text,
      parseMode: 'HTML'
    });
  }

  async getWelcomeMessage() {
    const shopName = escapeHtml(config.SHOP_NAME || 'Food Order Shop');
    return `👋 <b>Xin chào! Chào mừng bạn đến với hệ thống báo cáo ${shopName}.</b>\n\nVui lòng chọn loại thông tin bạn muốn tra cứu bên dưới:`;
  }

  async handleCommand(chatId, text) {
    const cleanCmd = (text || '').trim().toLowerCase().split(' ')[0];

    if (cleanCmd === '/start' || cleanCmd === '/menu' || cleanCmd === '/help') {
      const welcomeText = await this.getWelcomeMessage();
      return telegramClient.sendTelegramMessage({
        chatId,
        text: welcomeText,
        parseMode: 'HTML',
        replyMarkup: buildMenuReplyMarkup()
      });
    }

    if (cleanCmd === '/today' || cleanCmd === '/baocao') {
      const report = await reportService.generateSalesReport('today');
      const text = formatSalesReport(report);
      return telegramClient.sendTelegramMessage({
        chatId,
        text,
        parseMode: 'HTML',
        replyMarkup: buildMenuReplyMarkup()
      });
    }

    if (cleanCmd === '/month' || cleanCmd === '/thang') {
      const report = await reportService.generateSalesReport('month');
      const text = formatSalesReport(report);
      return telegramClient.sendTelegramMessage({
        chatId,
        text,
        parseMode: 'HTML',
        replyMarkup: buildMenuReplyMarkup()
      });
    }

    if (cleanCmd === '/week' || cleanCmd === '/tuan') {
      const report = await reportService.generateSalesReport('week');
      const text = formatSalesReport(report);
      return telegramClient.sendTelegramMessage({
        chatId,
        text,
        parseMode: 'HTML',
        replyMarkup: buildMenuReplyMarkup()
      });
    }

    if (cleanCmd === '/stock' || cleanCmd === '/inventory' || cleanCmd === '/tonkho') {
      const menuItems = await menuService.getMenu();
      const threshold = config.getLowStockThreshold();
      const timezone = config.ORDER_TIMEZONE || 'Asia/Ho_Chi_Minh';
      const text = formatInventoryReport(menuItems, threshold, timezone);
      return telegramClient.sendTelegramMessage({
        chatId,
        text,
        parseMode: 'HTML',
        replyMarkup: buildMenuReplyMarkup()
      });
    }

    // Default response for unrecognized text
    const defaultText = `❓ Lệnh không hợp lệ. Vui lòng bấm <b>/start</b> để mở Menu quản lý.`;
    return telegramClient.sendTelegramMessage({
      chatId,
      text: defaultText,
      parseMode: 'HTML',
      replyMarkup: buildMenuReplyMarkup()
    });
  }

  async handleCallbackQuery(callbackQuery) {
    const callbackQueryId = callbackQuery.id;
    const fromId = callbackQuery.from ? callbackQuery.from.id : null;
    const message = callbackQuery.message || {};
    const chatId = message.chat ? message.chat.id : null;
    const messageId = message.message_id;
    const data = callbackQuery.data || '';

    // Always acknowledge callback query to dismiss Telegram loading spinner
    await telegramClient.answerCallbackQuery({ callbackQueryId }).catch(err => {
      console.warn('[TelegramBotService] Answer callback query error:', err.message);
    });

    if (!this.isAuthorized(fromId)) {
      return this.sendUnauthorizedNotice(chatId, fromId);
    }

    let text = '';

    if (data === 'report:today') {
      const report = await reportService.generateSalesReport('today');
      text = formatSalesReport(report);
    } else if (data === 'report:month') {
      const report = await reportService.generateSalesReport('month');
      text = formatSalesReport(report);
    } else if (data === 'report:week') {
      const report = await reportService.generateSalesReport('week');
      text = formatSalesReport(report);
    } else if (data === 'inventory:current') {
      const menuItems = await menuService.getMenu();
      const threshold = config.getLowStockThreshold();
      const timezone = config.ORDER_TIMEZONE || 'Asia/Ho_Chi_Minh';
      text = formatInventoryReport(menuItems, threshold, timezone);
    } else if (data === 'menu:home') {
      text = await this.getWelcomeMessage();
    } else {
      text = `❓ Thao tác không hợp lệ. Bấm /start để mở lại menu.`;
    }

    try {
      return await telegramClient.editMessageText({
        chatId,
        messageId,
        text,
        parseMode: 'HTML',
        replyMarkup: buildMenuReplyMarkup()
      });
    } catch (err) {
      // If message edit fails (e.g. text unchanged or message too old), fallback to sending new message
      return await telegramClient.sendTelegramMessage({
        chatId,
        text,
        parseMode: 'HTML',
        replyMarkup: buildMenuReplyMarkup()
      });
    }
  }

  async handleUpdate(update) {
    if (!update || typeof update !== 'object') {
      return { handled: false, reason: 'Invalid payload' };
    }

    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return { handled: true, type: 'callback_query' };
    }

    if (update.message) {
      const message = update.message;
      const chatId = message.chat ? message.chat.id : null;
      const fromId = message.from ? message.from.id : null;
      const text = message.text;

      if (!chatId || !text) {
        return { handled: false, reason: 'Empty text or chatId' };
      }

      if (!this.isAuthorized(fromId)) {
        await this.sendUnauthorizedNotice(chatId, fromId);
        return { handled: true, type: 'unauthorized' };
      }

      await this.handleCommand(chatId, text);
      return { handled: true, type: 'message' };
    }

    return { handled: false, reason: 'Unhandled update type' };
  }
}

module.exports = new TelegramBotService();
