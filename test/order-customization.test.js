const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const orderService = require('../src/services/order-service');
const menuRepository = require('../src/repositories/menu-repository');

const MENU_FILE = path.join(__dirname, '..', 'src', 'data', 'menu.json');
const ORDERS_FILE = path.join(__dirname, '..', 'src', 'data', 'orders.json');

let originalMenuBackup = null;
let originalOrdersBackup = null;

describe('Order Service Customization & Snapshot Tests', () => {
  before(async () => {
    if (fs.existsSync(MENU_FILE)) {
      originalMenuBackup = fs.readFileSync(MENU_FILE, 'utf8');
    }
    if (fs.existsSync(ORDERS_FILE)) {
      originalOrdersBackup = fs.readFileSync(ORDERS_FILE, 'utf8');
    }

    const menuItems = await menuRepository.getAll();
    const comGa = menuItems.find(i => i.id === 'COM_GA');
    if (comGa) {
      comGa.customizationOptions = [
        { id: 'HANH_PHI', name: 'Hành phi', sortOrder: 1 },
        { id: 'TOI_PHI', name: 'Tỏi phi', sortOrder: 2 }
      ];
      menuRepository.saveAll(menuItems);
    }
  });



  after(() => {
    if (originalMenuBackup !== null) {
      fs.writeFileSync(MENU_FILE, originalMenuBackup, 'utf8');
    }
    if (originalOrdersBackup !== null) {
      fs.writeFileSync(ORDERS_FILE, originalOrdersBackup, 'utf8');
    }
  });

  it('processOrder: Đặt món với excludedOptionIds hợp lệ và lưu snapshot chính xác', async () => {
    const requestId = `test-req-custom-${Date.now()}`;
    const payload = {
      requestId,
      customer: {
        name: 'Nguyễn Văn Test',
        phone: '0901234567',
        address: '123 Đường Test, Quận 1',
        note: 'Giao nhanh'
      },
      items: [
        {
          productId: 'COM_GA',
          quantity: 2,
          excludedOptionIds: ['HANH_PHI', 'TOI_PHI']
        }
      ]
    };

    const res = await orderService.processOrder(payload);
    assert.equal(res.statusCode, 201);

    const orderRepository = require('../src/repositories/order-repository');
    const order = await orderRepository.findByRequestId(requestId);

    assert.ok(order);
    assert.equal(order.items.length, 1);
    const item = order.items[0];
    assert.equal(item.productId, 'COM_GA');
    assert.equal(item.quantity, 2);
    assert.ok(item.customization);
    assert.equal(item.customization.excludedOptions.length, 2);
    assert.equal(item.customization.excludedOptions[0].name, 'Hành phi');
    assert.equal(item.customization.excludedOptions[1].name, 'Tỏi phi');
  });

  it('processOrder: Giữ riêng 2 cấu hình khác nhau của cùng 1 món', async () => {
    const requestId = `test-req-separate-${Date.now()}`;
    const payload = {
      requestId,
      customer: {
        name: 'Trần Văn Test',
        phone: '0909876543',
        address: '456 Đường Test',
        note: ''
      },
      items: [
        {
          productId: 'COM_GA',
          quantity: 1,
          excludedOptionIds: ['HANH_PHI']
        },
        {
          productId: 'COM_GA',
          quantity: 1,
          excludedOptionIds: ['TOI_PHI']
        }
      ]
    };

    const res = await orderService.processOrder(payload);
    assert.equal(res.statusCode, 201);

    const orderRepository = require('../src/repositories/order-repository');
    const order = await orderRepository.findByRequestId(requestId);

    assert.equal(order.items.length, 2);
    assert.equal(order.items[0].customization.excludedOptions[0].id, 'HANH_PHI');
    assert.equal(order.items[1].customization.excludedOptions[0].id, 'TOI_PHI');
  });

  it('processOrder: Gom (merge) 2 dòng cùng cấu hình trùng productId và trùng excludedOptionIds', async () => {
    const requestId = `test-req-merge-${Date.now()}`;
    const payload = {
      requestId,
      customer: {
        name: 'Lê Văn Test',
        phone: '0912345678',
        address: '789 Đường Test'
      },
      items: [
        {
          productId: 'COM_GA',
          quantity: 1,
          excludedOptionIds: ['HANH_PHI']
        },
        {
          productId: 'COM_GA',
          quantity: 2,
          excludedOptionIds: ['HANH_PHI']
        }
      ]
    };

    const res = await orderService.processOrder(payload);
    assert.equal(res.statusCode, 201);

    const orderRepository = require('../src/repositories/order-repository');
    const order = await orderRepository.findByRequestId(requestId);

    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].quantity, 3);
  });

  it('processOrder: Từ chối option ID không hợp lệ hoặc không thuộc về món', async () => {
    const requestId = `test-req-invalid-opt-${Date.now()}`;
    const payload = {
      requestId,
      customer: {
        name: 'Phạm Văn Test',
        phone: '0987654321',
        address: '999 Đường Test'
      },
      items: [
        {
          productId: 'COM_GA',
          quantity: 1,
          excludedOptionIds: ['OPTION_FAKE_ID']
        }
      ]
    };

    await assert.rejects(
      async () => {
        await orderService.processOrder(payload);
      },
      (err) => err.status === 422 && err.message.includes('không hợp lệ hoặc không áp dụng')
    );
  });
});
