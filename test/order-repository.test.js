const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const orderRepository = require('../src/repositories/order-repository');

describe('OrderRepository Telegram Status Mapping Tests', () => {
  it('ưu tiên notificationStatus SENT từ MongoDB', () => {
    const order = orderRepository.formatDoc({
      id: 'FO-TEST-1',
      telegramSent: false,
      notificationStatus: 'SENT',
      telegramMessageId: 123
    });

    assert.equal(order.notificationStatus, 'SENT');
    assert.equal(order.telegramMessageId, 123);
  });

  it('hỗ trợ dữ liệu legacy chỉ có telegramSent', () => {
    const order = orderRepository.formatDoc({
      id: 'FO-TEST-2',
      telegramSent: true
    });

    assert.equal(order.notificationStatus, 'SENT');
  });

  it('sinh mã tiếp theo từ mã lớn nhất trong chế độ file', async () => {
    const dateKey = `209912${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;
    orderRepository.orders.set(`FO-${dateKey}-0002`, { id: `FO-${dateKey}-0002` });
    orderRepository.orders.set(`FO-${dateKey}-0007`, { id: `FO-${dateKey}-0007` });

    const orderId = await orderRepository.nextOrderId(dateKey);

    assert.equal(orderId, `FO-${dateKey}-0008`);
    orderRepository.orders.delete(`FO-${dateKey}-0002`);
    orderRepository.orders.delete(`FO-${dateKey}-0007`);
  });
});
