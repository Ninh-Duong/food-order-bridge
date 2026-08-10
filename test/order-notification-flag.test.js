const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'src', 'data', 'menu.json');
const ORDERS_FILE = path.join(__dirname, '..', 'src', 'data', 'orders.json');

let originalMenuBackup = null;
let originalOrdersBackup = null;

describe('TELEGRAM_ORDER_NOTIFICATIONS_ENABLED Feature Flag Tests', () => {
  let orderService;
  let menuService;
  let telegramService;
  let orderRepository;
  let originalEnvFlag;

  before(() => {
    if (fs.existsSync(MENU_FILE)) {
      originalMenuBackup = fs.readFileSync(MENU_FILE, 'utf8');
    }
    if (fs.existsSync(ORDERS_FILE)) {
      originalOrdersBackup = fs.readFileSync(ORDERS_FILE, 'utf8');
    }

    orderService = require('../src/services/order-service');
    menuService = require('../src/services/menu-service');
    telegramService = require('../src/services/telegram-service');
    orderRepository = require('../src/repositories/order-repository');
    originalEnvFlag = process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED;
  });

  after(() => {
    if (originalEnvFlag !== undefined) {
      process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED = originalEnvFlag;
    } else {
      delete process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED;
    }

    if (originalMenuBackup !== null) {
      fs.writeFileSync(MENU_FILE, originalMenuBackup, 'utf8');
    }
    if (originalOrdersBackup !== null) {
      fs.writeFileSync(ORDERS_FILE, originalOrdersBackup, 'utf8');
    }
  });

  it('Khi feature flag = false: không gọi Telegram, trả 201, notificationAttempts = 0', async () => {
    process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED = 'false';

    const itemId = 'FLAG_TEST_ITEM_' + Date.now();
    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Test Flag Off',
      categoryId: 'COM_GA',
      price: 50000,
      stockQuantity: 10,
      active: true
    });

    const originalNotify = telegramService.notifyNewOrder;
    let notifyCalled = false;
    telegramService.notifyNewOrder = async () => {
      notifyCalled = true;
      return { messageId: 999 };
    };

    try {
      const payload = {
        requestId: 'REQ_FLAG_OFF_' + Date.now(),
        customer: {
          name: 'Khách hàng Flag Off',
          phone: '0901111222',
          address: '123 Đường ABC'
        },
        items: [{ productId: itemId, quantity: 1 }]
      };

      const res = await orderService.processOrder(payload);

      assert.equal(notifyCalled, false, 'telegramService.notifyNewOrder không được gọi khi flag = false');
      assert.equal(res.statusCode, 201);
      assert.equal(res.result.status, 'CONFIRMED');
      assert.equal(res.result.notificationStatus, undefined, 'Public response không chứa notificationStatus');

      const savedOrder = await orderRepository.findById(res.result.orderId);
      assert.ok(savedOrder);
      assert.equal(savedOrder.notificationAttempts, 0);
      assert.equal(savedOrder.notificationError, null);
    } finally {
      telegramService.notifyNewOrder = originalNotify;
    }
  });

  it('Khi feature flag = true và Telegram gửi thành công: gọi Telegram, trả 201, notificationStatus = SENT', async () => {
    process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED = 'true';

    const itemId = 'FLAG_TEST_ITEM_ON_' + Date.now();
    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Test Flag On Success',
      categoryId: 'COM_GA',
      price: 50000,
      stockQuantity: 10,
      active: true
    });

    const originalNotify = telegramService.notifyNewOrder;
    let notifyCalled = false;
    telegramService.notifyNewOrder = async () => {
      notifyCalled = true;
      return { messageId: 888 };
    };

    try {
      const payload = {
        requestId: 'REQ_FLAG_ON_SUCCESS_' + Date.now(),
        customer: {
          name: 'Khách hàng Flag On',
          phone: '0901111222',
          address: '123 Đường ABC'
        },
        items: [{ productId: itemId, quantity: 1 }]
      };

      const res = await orderService.processOrder(payload);

      assert.equal(notifyCalled, true, 'telegramService.notifyNewOrder phải được gọi khi flag = true');
      assert.equal(res.statusCode, 201);
      assert.equal(res.result.status, 'CONFIRMED');
      assert.equal(res.result.notificationStatus, 'SENT');

      const savedOrder = await orderRepository.findById(res.result.orderId);
      assert.ok(savedOrder);
      assert.equal(savedOrder.notificationStatus, 'SENT');
      assert.equal(savedOrder.telegramMessageId, 888);
      assert.equal(savedOrder.notificationAttempts, 1);
    } finally {
      telegramService.notifyNewOrder = originalNotify;
    }
  });

  it('Khi feature flag = true và Telegram gửi thất bại: gọi Telegram, trả 202, notificationStatus = FAILED', async () => {
    process.env.TELEGRAM_ORDER_NOTIFICATIONS_ENABLED = 'true';

    const itemId = 'FLAG_TEST_ITEM_ERR_' + Date.now();
    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Test Flag On Error',
      categoryId: 'COM_GA',
      price: 50000,
      stockQuantity: 10,
      active: true
    });

    const originalNotify = telegramService.notifyNewOrder;
    let notifyCalled = false;
    telegramService.notifyNewOrder = async () => {
      notifyCalled = true;
      throw new Error('Telegram Bot API down mock error');
    };

    try {
      const payload = {
        requestId: 'REQ_FLAG_ON_ERR_' + Date.now(),
        customer: {
          name: 'Khách hàng Flag On Fail',
          phone: '0901111222',
          address: '123 Đường ABC'
        },
        items: [{ productId: itemId, quantity: 1 }]
      };

      const res = await orderService.processOrder(payload);

      assert.equal(notifyCalled, true, 'telegramService.notifyNewOrder phải được gọi khi flag = true');
      assert.equal(res.statusCode, 202);
      assert.equal(res.result.status, 'CONFIRMED');
      assert.equal(res.result.notificationStatus, 'FAILED');

      const savedOrder = await orderRepository.findById(res.result.orderId);
      assert.ok(savedOrder);
      assert.equal(savedOrder.notificationStatus, 'FAILED');
      assert.equal(savedOrder.notificationAttempts, 1);
      assert.equal(savedOrder.notificationError, 'Telegram Bot API down mock error');
    } finally {
      telegramService.notifyNewOrder = originalNotify;
    }
  });
});
