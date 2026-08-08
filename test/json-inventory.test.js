const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'src', 'data', 'menu.json');
const ORDERS_FILE = path.join(__dirname, '..', 'src', 'data', 'orders.json');

let originalMenuBackup = null;
let originalOrdersBackup = null;

describe('JSON Inventory Concurrency & Single Process Tests', () => {
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

  it('Hai request cạnh tranh mua món cuối cùng (stock = 1) đồng thời -> Chỉ 1 request thành công, 1 nhận 409, stock về 0', async () => {
    const timeId = Date.now();
    const itemId = 'CONCURRENCY_ITEM_' + timeId;

    // Create item with stock = 1
    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Cuối Cùng',
      categoryId: 'COM_GA',
      price: 50000,
      discountPercent: 0,
      stockQuantity: 1,
      active: true
    });

    const req1 = orderService.processOrder({
      requestId: 'REQ_CONCURRENT_1_' + timeId,
      customer: { name: 'Khách A', phone: '0901111111', address: '123 A' },
      items: [{ productId: itemId, quantity: 1 }]
    });

    const req2 = orderService.processOrder({
      requestId: 'REQ_CONCURRENT_2_' + timeId,
      customer: { name: 'Khách B', phone: '0902222222', address: '456 B' },
      items: [{ productId: itemId, quantity: 1 }]
    });

    const results = await Promise.allSettled([req1, req2]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Chính xác 1 request thành công');
    assert.equal(rejected.length, 1, 'Chính xác 1 request bị từ chối');

    const err = rejected[0].reason;
    assert.equal(err.status, 409, 'Lỗi từ chối có mã HTTP 409 Conflict');
    assert.equal(err.code, 'INSUFFICIENT_STOCK');

    // Final stock MUST be 0
    const finalItem = await menuService.getMenuItem(itemId);
    assert.equal(finalItem.stockQuantity, 0);
  });
});
