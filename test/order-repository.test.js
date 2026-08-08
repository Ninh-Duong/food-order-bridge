const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const orderRepository = require('../src/repositories/order-repository');

describe('OrderRepository Telegram & Attribute Mapping Tests', () => {
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

  it('giữ nguyên giá trị totalAmount = 0 mà không bị fallback bởi toán tử ||', () => {
    const formatted = orderRepository.formatDoc({
      id: 'FO-TEST-00',
      totalPrice: 0,
      subtotalAmount: 0,
      discountAmount: 0
    });

    assert.equal(formatted.totalAmount, 0);
    assert.equal(formatted.subtotalAmount, 0);
    assert.equal(formatted.discountAmount, 0);
  });

  it('xử lý an toàn đơn chưa thanh toán (isPaid = false) trả paidBy = null và paidAt = null', () => {
    const formatted = orderRepository.formatDoc({
      id: 'FO-TEST-UNPAID',
      isPaid: false,
      paidAt: null,
      paidBy: null
    });

    assert.equal(formatted.isPaid, false);
    assert.equal(formatted.paidAt, null);
    assert.equal(formatted.paidBy, null);
  });

  it('xử lý an toàn đơn legacy thiếu thông tin customerName / phone / items', () => {
    const formatted = orderRepository.formatDoc({
      id: 'FO-TEST-LEGACY',
      totalPrice: 50000
    });

    assert.equal(formatted.id, 'FO-TEST-LEGACY');
    assert.equal(formatted.customer.name, '');
    assert.equal(formatted.customer.phone, '');
    assert.equal(formatted.customer.address, '');
    assert.equal(formatted.customer.note, '');
    assert.deepEqual(formatted.items, []);
    assert.equal(formatted.totalAmount, 50000);
    assert.equal(formatted.isPaid, false);
  });
});
