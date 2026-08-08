const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'src', 'data', 'menu.json');
const ORDERS_FILE = path.join(__dirname, '..', 'src', 'data', 'orders.json');

let originalMenuBackup = null;
let originalOrdersBackup = null;

describe('Order Idempotency & Retry Tests', () => {
  let orderService;
  let menuService;

  before(() => {
    if (fs.existsSync(MENU_FILE)) {
      originalMenuBackup = fs.readFileSync(MENU_FILE, 'utf8');
    }
    if (fs.existsSync(ORDERS_FILE)) {
      originalOrdersBackup = fs.readFileSync(ORDERS_FILE, 'utf8');
    }

    orderService = require('../src/services/order-service');
    menuService = require('../src/services/menu-service');
  });

  after(() => {
    if (originalMenuBackup !== null) {
      fs.writeFileSync(MENU_FILE, originalMenuBackup, 'utf8');
    }
    if (originalOrdersBackup !== null) {
      fs.writeFileSync(ORDERS_FILE, originalOrdersBackup, 'utf8');
    }
  });

  it('Gửi retry cùng requestId không trừ kho lần thứ hai và trả lại order đã tạo', async () => {
    const timeId = Date.now();
    const itemId = 'IDEM_ITEM_' + timeId;

    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Idempotency',
      categoryId: 'COM_GA',
      price: 100000,
      discountPercent: 10, // salePrice = 90.000đ
      stockQuantity: 10,
      active: true
    });

    const reqId = 'REQ_IDEMPOTENT_' + timeId;
    const payload = {
      requestId: reqId,
      customer: {
        name: 'Nguyễn Văn Idempotency',
        phone: '0908888888',
        address: '888 Đường Lê Lợi'
      },
      items: [{ productId: itemId, quantity: 2 }]
    };

    // First request
    const res1 = await orderService.processOrder(payload);
    assert.equal(res1.result.status, 'CONFIRMED');
    assert.ok([201, 202].includes(res1.statusCode));
    const orderId1 = res1.result.orderId;

    // Check stock reduced from 10 to 8
    let itemCheck = await menuService.getMenuItem(itemId);
    assert.equal(itemCheck.stockQuantity, 8);

    // Second request with SAME requestId (simulate network retry)
    const res2 = await orderService.processOrder(payload);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.result.orderId, orderId1);

    // Stock MUST still be 8 (not reduced to 6!)
    itemCheck = await menuService.getMenuItem(itemId);
    assert.equal(itemCheck.stockQuantity, 8);
  });
});
