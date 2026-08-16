const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const settingsService = require('../src/services/tenant-telegram-settings-service');
const tenantBotService = require('../src/services/tenant-telegram-bot-service');
const telegramClient = require('../src/integrations/telegram-client');
const reportService = require('../src/services/report-service');

describe('Tenant-scoped Telegram settings and report access', () => {
  const env = {};
  let originalSendMessage;
  let originalSendPhoto;
  let originalGenerateReport;

  before(() => {
    for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_ORDER_NOTIFICATIONS_ENABLED']) env[key] = process.env[key];
    process.env.TELEGRAM_BOT_TOKEN = '';
    process.env.TELEGRAM_CHAT_ID = '';
    process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED = 'false';
    originalSendMessage = telegramClient.sendTelegramMessage;
    originalSendPhoto = telegramClient.sendTelegramPhoto;
    originalGenerateReport = reportService.generateSalesReport;
  });

  after(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    telegramClient.sendTelegramMessage = originalSendMessage;
    telegramClient.sendTelegramPhoto = originalSendPhoto;
    reportService.generateSalesReport = originalGenerateReport;
  });

  it('Store config không bị lẫn và Branch override kế thừa credential từ Store', async () => {
    await settingsService.upsertSettings({
      storeId: 'telegram-store-a',
      payload: {
        enabled: true,
        telegramBotToken: '123456:store-a-secret',
        chatId: '-100-a',
        pendingOrderLimit: 8,
        timezone: 'Asia/Ho_Chi_Minh'
      }
    });
    await settingsService.upsertSettings({
      storeId: 'telegram-store-b',
      payload: { enabled: true, telegramBotToken: '123456:store-b-secret', chatId: '-100-b', pendingOrderLimit: 2 }
    });
    await settingsService.upsertSettings({
      storeId: 'telegram-store-a',
      branchId: 'branch-a1',
      payload: { pendingOrderLimit: 3 }
    });

    const a = await settingsService.getEffectiveSettings({ storeId: 'telegram-store-a', branchId: 'branch-a1' });
    const b = await settingsService.getEffectiveSettings({ storeId: 'telegram-store-b' });
    assert.equal(a.pendingOrderLimit, 3);
    assert.equal(a.token, '123456:store-a-secret');
    assert.equal(b.pendingOrderLimit, 2);
    assert.equal(b.token, '123456:store-b-secret');
    assert.equal((await settingsService.serializeSettings(a)).telegramBotToken, '1234...cret');
  });

  it('Danh sách quyền report hỗ trợ nhiều Telegram User ID theo Store/Branch', async () => {
    await settingsService.replaceReportAccess({
      storeId: 'telegram-store-a',
      users: ['101', { telegramUserId: '202', canReceiveAlerts: false }, '101']
    });
    const access = await settingsService.getEffectiveReportAccess({ storeId: 'telegram-store-a', branchId: 'branch-a1' });
    assert.deepEqual(access.map(item => item.telegramUserId).sort(), ['101', '202']);
    assert.equal(access.find(item => item.telegramUserId === '202').canReceiveAlerts, false);
  });

  it('Telegram bot tenant route truyền đúng tenantContext và credential riêng của Store', async () => {
    const sent = [];
    telegramClient.sendTelegramMessage = async payload => { sent.push(payload); return { ok: true, messageId: 1 }; };
    telegramClient.sendTelegramPhoto = async () => ({ ok: true, messageId: 2 });
    reportService.generateSalesReport = async (period, referenceDate, tenantContext) => ({
      filter: period,
      reportDate: '17/08/2026',
      generatedAt: referenceDate,
      timezone: 'Asia/Ho_Chi_Minh',
      summary: { paidOrderCount: 1, totalQuantitySold: 1, subtotalAmount: 10000, discountAmount: 0, revenue: 10000 },
      products: [],
      hourlyOrders: [],
      tenantContext
    });

    const result = await tenantBotService.handleUpdate({
      message: { chat: { id: 303 }, from: { id: 101 }, text: '/today' }
    }, { storeId: 'telegram-store-a', branchId: 'branch-a1' });

    assert.equal(result.handled, true);
    assert.ok(sent.length >= 1);
    assert.equal(sent[0].telegramConfig.token, '123456:store-a-secret');
    assert.ok(sent[0].text.includes('BÁO CÁO DOANH THU'));
  });

  it('User không có quyền report bị từ chối theo tenant', async () => {
    const sent = [];
    telegramClient.sendTelegramMessage = async payload => { sent.push(payload); return { ok: true }; };
    const result = await tenantBotService.handleUpdate({
      message: { chat: { id: 999 }, from: { id: 999 }, text: '/today' }
    }, { storeId: 'telegram-store-a', branchId: 'branch-a1' });
    assert.equal(result.type, 'unauthorized');
    assert.ok(sent[0].text.includes('không có quyền'));
  });
});
