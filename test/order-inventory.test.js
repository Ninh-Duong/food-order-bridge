const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'src', 'data', 'menu.json');
const ORDERS_FILE = path.join(__dirname, '..', 'src', 'data', 'orders.json');

let originalMenuBackup = null;
let originalOrdersBackup = null;

describe('Order & Inventory Transaction Tests', () => {
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

  it('Tạo đơn hàng thành công khi số lượng <= tồn kho và trừ kho chính xác', async () => {
    const timeId = Date.now();
    const itemId = 'INV_TEST_ITEM_' + timeId;

    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Test Tồn Kho',
      categoryId: 'COM_GA',
      price: 100000,
      discountPercent: 20, // salePrice = 80.000đ
      stockQuantity: 10,
      active: true
    });

    const reqId = 'REQ_INV_OK_' + timeId;
    const res = await orderService.processOrder({
      requestId: reqId,
      customer: {
        name: 'Nguyễn Văn Test',
        phone: '0901234567',
        address: '123 Đường Test'
      },
      items: [{ productId: itemId, quantity: 3 }]
    });

    assert.equal(res.result.status, 'CONFIRMED');
    assert.ok([201, 202].includes(res.statusCode));
    assert.equal(res.result.total, 240000); // 80.000 * 3 = 240.000đ

    // Check stock was decremented from 10 to 7
    const updatedItem = await menuService.getMenuItem(itemId);
    assert.equal(updatedItem.stockQuantity, 7);
  });

  it('Từ chối đặt hàng khi vượt quá tồn kho hiện tại (trả HTTP 409 INSUFFICIENT_STOCK)', async () => {
    const timeId = Date.now();
    const itemId = 'INV_EXCEED_ITEM_' + timeId;

    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Sắp Hết Kho',
      categoryId: 'COM_GA',
      price: 50000,
      discountPercent: 0,
      stockQuantity: 2,
      active: true
    });

    const reqId = 'REQ_EXCEED_' + timeId;

    await assert.rejects(
      async () => {
        await orderService.processOrder({
          requestId: reqId,
          customer: {
            name: 'Khách Mua Vượt Kho',
            phone: '0901234567',
            address: '123 Đường Test'
          },
          items: [{ productId: itemId, quantity: 5 }]
        });
      },
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'INSUFFICIENT_STOCK');
        assert.equal(err.items[0].productId, itemId);
        assert.equal(err.items[0].availableQuantity, 2);
        return true;
      }
    );

    // Verify stock remains unchanged at 2
    const itemCheck = await menuService.getMenuItem(itemId);
    assert.equal(itemCheck.stockQuantity, 2);
  });

  it('Tự động gom (aggregate) các sản phẩm trùng productId trong payload', async () => {
    const timeId = Date.now();
    const itemId = 'INV_DUP_ITEM_' + timeId;

    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Trùng Payload',
      categoryId: 'COM_GA',
      price: 40000,
      discountPercent: 0,
      stockQuantity: 10,
      active: true
    });

    const reqId = 'REQ_DUP_' + timeId;
    // Client sends duplicate entries: 3 + 4 = 7
    const res = await orderService.processOrder({
      requestId: reqId,
      customer: {
        name: 'Khách Đặt Trùng',
        phone: '0901234567',
        address: '123 Đường Test'
      },
      items: [
        { productId: itemId, quantity: 3 },
        { productId: itemId, quantity: 4 }
      ]
    });

    assert.equal(res.result.status, 'CONFIRMED');
    assert.ok([201, 202].includes(res.statusCode));
    assert.equal(res.result.total, 280000); // 40.000 * 7 = 280.000đ

    // Stock decremented by total 7 -> remaining 3
    const itemCheck = await menuService.getMenuItem(itemId);
    assert.equal(itemCheck.stockQuantity, 3);
  });

  it('Từ chối đặt món đang tạm ngưng bán (active = false)', async () => {
    const timeId = Date.now();
    const itemId = 'INV_INACTIVE_ITEM_' + timeId;

    await menuService.saveMenuItem({
      id: itemId,
      name: 'Món Tạm Ngưng',
      categoryId: 'COM_GA',
      price: 50000,
      discountPercent: 0,
      stockQuantity: 10,
      active: false
    });

    await assert.rejects(
      async () => {
        await orderService.processOrder({
          requestId: 'REQ_INACTIVE_' + timeId,
          customer: { name: 'Test', phone: '0901234567', address: '123 Test' },
          items: [{ productId: itemId, quantity: 1 }]
        });
      },
      (err) => err.status === 422 && err.message.includes('tạm ngưng')
    );
  });
});
