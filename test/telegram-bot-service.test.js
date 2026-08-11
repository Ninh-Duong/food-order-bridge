const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const telegramClient = require('../src/integrations/telegram-client');
const telegramBotService = require('../src/services/telegram-bot-service');
const reportService = require('../src/services/report-service');
const menuService = require('../src/services/menu-service');

describe('Telegram Bot Service Tests', () => {
  let originalGetAdminUserIds;
  let originalGetChatId;
  let originalSendMessage;
  let originalSendPhoto;
  let originalAnswerCallback;
  let originalEditMessage;
  let originalGenerateReport;
  let originalGetMenu;

  let sentMessages = [];
  let sentPhotos = [];
  let answeredCallbacks = [];
  let editedMessages = [];

  beforeEach(() => {
    originalGetAdminUserIds = config.getTelegramAdminUserIds;
    originalGetChatId = config.getTelegramChatId;
    originalSendMessage = telegramClient.sendTelegramMessage;
    originalSendPhoto = telegramClient.sendTelegramPhoto;
    originalAnswerCallback = telegramClient.answerCallbackQuery;
    originalEditMessage = telegramClient.editMessageText;
    originalGenerateReport = reportService.generateSalesReport;
    originalGetMenu = menuService.getMenu;

    sentMessages = [];
    sentPhotos = [];
    answeredCallbacks = [];
    editedMessages = [];

    telegramClient.sendTelegramMessage = async (payload) => {
      sentMessages.push(payload);
      return { ok: true, messageId: 100 };
    };

    telegramClient.sendTelegramPhoto = async (payload) => {
      sentPhotos.push(payload);
      return { ok: true, messageId: 101 };
    };

    telegramClient.answerCallbackQuery = async (payload) => {
      answeredCallbacks.push(payload);
      return { ok: true };
    };

    telegramClient.editMessageText = async (payload) => {
      editedMessages.push(payload);
      return { ok: true, messageId: payload.messageId };
    };

    reportService.generateSalesReport = async (period) => {
      return {
        filter: period,
        timezone: 'Asia/Ho_Chi_Minh',
        generatedAt: '2026-08-10T12:00:00.000+07:00',
        summary: { paidOrderCount: 5, totalQuantitySold: 10, subtotalAmount: 500000, discountAmount: 0, revenue: 500000 },
        products: [{ productName: 'Phở bò', quantitySold: 10, revenue: 500000 }]
      };
    };

    menuService.getMenu = async () => {
      return [
        { name: 'Phở bò', stockQuantity: 10, isActive: true },
        { name: 'Trà đá', stockQuantity: 0, isActive: true }
      ];
    };
  });

  afterEach(() => {
    config.getTelegramAdminUserIds = originalGetAdminUserIds;
    config.getTelegramChatId = originalGetChatId;
    telegramClient.sendTelegramMessage = originalSendMessage;
    telegramClient.sendTelegramPhoto = originalSendPhoto;
    telegramClient.answerCallbackQuery = originalAnswerCallback;
    telegramClient.editMessageText = originalEditMessage;
    reportService.generateSalesReport = originalGenerateReport;
    menuService.getMenu = originalGetMenu;
  });

  it('isAuthorized: Xác thực đúng ID Admin và từ chối ID lạ', () => {
    config.getTelegramAdminUserIds = () => ['123456', '789012'];

    assert.equal(telegramBotService.isAuthorized('123456'), true);
    assert.equal(telegramBotService.isAuthorized(123456), true);
    assert.equal(telegramBotService.isAuthorized('789012'), true);
    assert.equal(telegramBotService.isAuthorized('999999'), false);
    assert.equal(telegramBotService.isAuthorized(null), false);
  });

  it('handleUpdate: Lệnh /start gửi menu nút bấm', async () => {
    config.getTelegramAdminUserIds = () => ['123456'];

    const update = {
      message: {
        chat: { id: 123456 },
        from: { id: 123456 },
        text: '/start'
      }
    };

    const result = await telegramBotService.handleUpdate(update);
    assert.equal(result.handled, true);
    assert.equal(result.type, 'message');
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].chatId, 123456);
    assert.ok(sentMessages[0].text.includes('Xin chào!'));
    assert.ok(sentMessages[0].replyMarkup.inline_keyboard);
  });

  it('handleUpdate: Lệnh từ người dùng KHÔNG CÓ QUYỀN bị từ chối kèm Telegram ID', async () => {
    config.getTelegramAdminUserIds = () => ['123456'];

    const update = {
      message: {
        chat: { id: 999999 },
        from: { id: 999999 },
        text: '/start'
      }
    };

    const result = await telegramBotService.handleUpdate(update);
    assert.equal(result.handled, true);
    assert.equal(result.type, 'unauthorized');
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.includes('Bạn không có quyền xem báo cáo'));
    assert.ok(sentMessages[0].text.includes('999999'));
  });

  it('handleUpdate: Lệnh /today trả báo cáo doanh thu hôm nay', async () => {
    config.getTelegramAdminUserIds = () => ['123456'];

    const update = {
      message: {
        chat: { id: 123456 },
        from: { id: 123456 },
        text: '/today'
      }
    };

    const result = await telegramBotService.handleUpdate(update);
    assert.equal(result.handled, true);
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.includes('BÁO CÁO DOANH THU HÔM NAY'));
  });

  it('handleUpdate: Lệnh /ngay gửi báo cáo theo ngày và biểu đồ giờ', async () => {
    config.getTelegramAdminUserIds = () => ['123456'];
    reportService.generateSalesReport = async (period, referenceDate) => ({
      filter: period,
      reportDate: '09/08/2026',
      referenceDate,
      timezone: 'Asia/Ho_Chi_Minh',
      generatedAt: '2026-08-09T12:00:00.000+07:00',
      summary: { paidOrderCount: 2, totalQuantitySold: 3, subtotalAmount: 100000, discountAmount: 0, revenue: 100000 },
      products: [],
      hourlyOrders: [{ hour: 18, label: '18:00', totalOrderCount: 2 }]
    });

    await telegramBotService.handleUpdate({
      message: {
        chat: { id: 123456 },
        from: { id: 123456 },
        text: '/ngay 09/08/2026'
      }
    });

    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.includes('BÁO CÁO DOANH THU NGÀY 09/08/2026'));
    assert.equal(sentPhotos.length, 1);
    assert.ok(sentPhotos[0].photo.includes('quickchart.io'));
  });

  it('handleUpdate: Nút theo ngày yêu cầu nhập ngày rồi xử lý tin nhắn tiếp theo', async () => {
    config.getTelegramAdminUserIds = () => ['123456'];

    await telegramBotService.handleUpdate({
      callback_query: {
        id: 'cb_date_1',
        from: { id: 123456 },
        message: { chat: { id: 123456 }, message_id: 57 },
        data: 'report:date'
      }
    });

    assert.ok(sentMessages[0].replyMarkup.force_reply);

    await telegramBotService.handleUpdate({
      message: {
        chat: { id: 123456 },
        from: { id: 123456 },
        text: '09/08/2026'
      }
    });

    assert.ok(sentMessages.some(message => message.text.includes('BÁO CÁO DOANH THU NGÀY')));
  });

  it('handleUpdate: Callback Query report:today gọi editMessageText', async () => {
    config.getTelegramAdminUserIds = () => ['123456'];

    const update = {
      callback_query: {
        id: 'cb_1001',
        from: { id: 123456 },
        message: { chat: { id: 123456 }, message_id: 55 },
        data: 'report:today'
      }
    };

    const result = await telegramBotService.handleUpdate(update);
    assert.equal(result.handled, true);
    assert.equal(result.type, 'callback_query');
    assert.equal(answeredCallbacks.length, 1);
    assert.equal(editedMessages.length, 1);
    assert.equal(editedMessages[0].chatId, 123456);
    assert.equal(editedMessages[0].messageId, 55);
    assert.ok(editedMessages[0].text.includes('BÁO CÁO DOANH THU HÔM NAY'));
  });

  it('handleUpdate: Callback Query inventory:current trả về danh sách tồn kho', async () => {
    config.getTelegramAdminUserIds = () => ['123456'];

    const update = {
      callback_query: {
        id: 'cb_1002',
        from: { id: 123456 },
        message: { chat: { id: 123456 }, message_id: 56 },
        data: 'inventory:current'
      }
    };

    await telegramBotService.handleUpdate(update);
    assert.equal(editedMessages.length, 1);
    assert.ok(editedMessages[0].text.includes('BÁO CÁO TỒN KHO HIỆN TẠI'));
    assert.ok(editedMessages[0].text.includes('Trà đá'));
  });
});
