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
});
