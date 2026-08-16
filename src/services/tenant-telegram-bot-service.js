const telegramClient = require('../integrations/telegram-client');
const reportService = require('./report-service');
const menuService = require('./menu-service');
const { parseReportDate } = require('./telegram-date-parser');
const { buildHourlyChartUrl } = require('./telegram-chart-service');
const { formatSalesReport, formatInventoryReport, buildMenuReplyMarkup, escapeHtml } = require('./telegram-report-formatter');
const { getEffectiveSettings, getEffectiveReportAccess } = require('./tenant-telegram-settings-service');

const pendingDateRequests = new Map();
const DATE_REQUEST_TTL_MS = 10 * 60 * 1000;

class TenantTelegramBotService {
  async isAuthorized(userId, tenantContext, settings, access) {
    if (!userId) return false;
    if (Array.isArray(access) && access.length > 0) {
      return access.some(item => item.active !== false && item.canViewReports !== false && String(item.telegramUserId) === String(userId).trim());
    }
    return Boolean(settings.recipientChatIds?.some(id => String(id) === String(userId).trim()));
  }

  async send(chatId, text, settings, extra = {}) {
    return telegramClient.sendTelegramMessage({
      chatId,
      text,
      telegramConfig: settings,
      ...extra
    });
  }

  async sendUnauthorized(chatId, userId, settings) {
    return this.send(chatId, `⛔ <b>Bạn không có quyền xem báo cáo của cửa hàng.</b>\n\nTelegram User ID: <code>${escapeHtml(userId)}</code>\n\n<i>Vui lòng liên hệ Super Admin để được cấp quyền.</i>`, settings, { parseMode: 'HTML' });
  }

  async sendChart(chatId, report, settings) {
    if (settings.chartEnabled === false || !report.hourlyOrders?.length) return null;
    try {
      return await telegramClient.sendTelegramPhoto({
        chatId,
        photo: buildHourlyChartUrl(report),
        caption: `📈 Biểu đồ số đơn theo giờ ngày ${report.reportDate || ''}`,
        replyMarkup: buildMenuReplyMarkup(),
        telegramConfig: settings
      });
    } catch (err) {
      await this.send(chatId, '⚠️ Không thể tải biểu đồ lúc này. Báo cáo text vẫn được gửi đầy đủ.', settings, { parseMode: 'HTML' }).catch(() => {});
      return null;
    }
  }

  async sendReport(chatId, report, settings) {
    const result = await this.send(chatId, formatSalesReport(report), settings, {
      parseMode: 'HTML',
      replyMarkup: buildMenuReplyMarkup()
    });
    await this.sendChart(chatId, report, settings);
    return result;
  }

  async sendDateReport(chatId, input, settings, tenantContext) {
    const parsed = parseReportDate(input);
    if (!parsed) {
      return this.send(chatId, '⚠️ Ngày không hợp lệ hoặc là ngày tương lai. Vui lòng nhập DD/MM/YYYY.', settings, { parseMode: 'HTML' });
    }
    pendingDateRequests.delete(`${tenantContext.storeId}:${chatId}`);
    const report = await reportService.generateSalesReport('date', parsed.referenceDate, tenantContext);
    return this.sendReport(chatId, report, settings);
  }

  async handleCommand(chatId, text, settings, tenantContext) {
    const parts = String(text || '').trim().split(/\s+/);
    const command = (parts[0] || '').toLowerCase();
    if (['/start', '/menu', '/help'].includes(command)) {
      return this.send(chatId, `👋 <b>Báo cáo Store ${escapeHtml(tenantContext.storeId)}</b>\n\nVui lòng chọn thông tin cần tra cứu.`, settings, { parseMode: 'HTML', replyMarkup: buildMenuReplyMarkup() });
    }
    if (['/today', '/baocao'].includes(command)) return this.sendReport(chatId, await reportService.generateSalesReport('today', new Date(), tenantContext), settings);
    if (['/week', '/tuan'].includes(command)) return this.sendReport(chatId, await reportService.generateSalesReport('week', new Date(), tenantContext), settings);
    if (['/month', '/thang'].includes(command)) return this.sendReport(chatId, await reportService.generateSalesReport('month', new Date(), tenantContext), settings);
    if (['/date', '/ngay'].includes(command)) {
      if (parts[1]) return this.sendDateReport(chatId, parts[1], settings, tenantContext);
      pendingDateRequests.set(`${tenantContext.storeId}:${chatId}`, Date.now());
      return this.send(chatId, '📅 Vui lòng nhập ngày theo định dạng <code>DD/MM/YYYY</code>.', settings, { parseMode: 'HTML', replyMarkup: { force_reply: true } });
    }
    if (['/stock', '/inventory', '/tonkho'].includes(command)) {
      const items = await menuService.getMenuForTenant(tenantContext);
      return this.send(chatId, formatInventoryReport(items, settings.lowStockThreshold, settings.timezone), settings, { parseMode: 'HTML', replyMarkup: buildMenuReplyMarkup() });
    }
    return this.send(chatId, '❓ Lệnh không hợp lệ. Bấm /start để mở menu.', settings, { parseMode: 'HTML', replyMarkup: buildMenuReplyMarkup() });
  }

  async handleCallback(callbackQuery, settings, tenantContext, access) {
    const callbackQueryId = callbackQuery.id;
    const fromId = callbackQuery.from?.id;
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    await telegramClient.answerCallbackQuery({ callbackQueryId, telegramConfig: settings }).catch(() => {});
    if (!(await this.isAuthorized(fromId, tenantContext, settings, access))) return this.sendUnauthorized(chatId, fromId, settings);

    let text;
    let report = null;
    if (callbackQuery.data === 'report:today') { report = await reportService.generateSalesReport('today', new Date(), tenantContext); text = formatSalesReport(report); }
    else if (callbackQuery.data === 'report:week') text = formatSalesReport(await reportService.generateSalesReport('week', new Date(), tenantContext));
    else if (callbackQuery.data === 'report:month') text = formatSalesReport(await reportService.generateSalesReport('month', new Date(), tenantContext));
    else if (callbackQuery.data === 'report:date') return this.send(chatId, '📅 Vui lòng nhập ngày theo định dạng <code>DD/MM/YYYY</code>.', settings, { parseMode: 'HTML', replyMarkup: { force_reply: true } });
    else if (callbackQuery.data === 'inventory:current') text = formatInventoryReport(await menuService.getMenuForTenant(tenantContext), settings.lowStockThreshold, settings.timezone);
    else text = `👋 <b>Báo cáo Store ${escapeHtml(tenantContext.storeId)}</b>`;

    try {
      const result = await telegramClient.editMessageText({ chatId, messageId, text, parseMode: 'HTML', replyMarkup: buildMenuReplyMarkup(), telegramConfig: settings });
      if (report) await this.sendChart(chatId, report, settings);
      return result;
    } catch (_) {
      return this.send(chatId, text, settings, { parseMode: 'HTML', replyMarkup: buildMenuReplyMarkup() });
    }
  }

  async handleUpdate(update, tenantContext) {
    if (!tenantContext?.storeId || !update || typeof update !== 'object') return { handled: false, reason: 'Invalid tenant update' };
    const settings = await getEffectiveSettings(tenantContext);
    const access = await getEffectiveReportAccess(tenantContext);
    if (!settings.enabled) return { handled: false, reason: 'Telegram disabled' };

    if (update.callback_query) {
      await this.handleCallback(update.callback_query, settings, tenantContext, access);
      return { handled: true, type: 'callback_query' };
    }
    const message = update.message;
    const chatId = message?.chat?.id;
    const fromId = message?.from?.id;
    const text = message?.text;
    if (!chatId || !text) return { handled: false, reason: 'Empty text or chatId' };
    if (!(await this.isAuthorized(fromId, tenantContext, settings, access))) {
      await this.sendUnauthorized(chatId, fromId, settings);
      return { handled: true, type: 'unauthorized' };
    }
    const pendingKey = `${tenantContext.storeId}:${chatId}`;
    const pendingAt = pendingDateRequests.get(pendingKey);
    if (pendingAt && Date.now() - pendingAt <= DATE_REQUEST_TTL_MS && !text.trim().startsWith('/')) {
      await this.sendDateReport(chatId, text.trim(), settings, tenantContext);
      return { handled: true, type: 'date_input' };
    }
    pendingDateRequests.delete(pendingKey);
    await this.handleCommand(chatId, text, settings, tenantContext);
    return { handled: true, type: 'message' };
  }
}

module.exports = new TenantTelegramBotService();
