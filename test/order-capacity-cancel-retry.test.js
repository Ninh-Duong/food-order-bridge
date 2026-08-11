const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const orderRepository = require('../src/repositories/order-repository');
const orderService = require('../src/services/order-service');
const reportService = require('../src/services/report-service');

const ORDERS_FILE = path.join(__dirname, '..', 'src', 'data', 'orders.json');
const originalOrdersFile = fs.readFileSync(ORDERS_FILE, 'utf8');

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildPendingOrder(id, overrides = {}) {
  return {
    id,
    requestId: id,
    fulfillmentType: 'DINE_IN',
    customer: { name: '', phone: '', address: '', note: '' },
    items: [],
    totalAmount: 50000,
    orderStatus: 'CONFIRMED',
    isPaid: false,
    paymentMethod: 'BANK_QR',
    paymentStatus: 'PENDING',
    orderActionTokenHash: tokenHash(id),
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Payment capacity, auto-cancel and retry flow', () => {
  const oldLimit = process.env.PAYMENT_PENDING_ORDER_LIMIT;
  const oldScope = process.env.PAYMENT_PENDING_SCOPE;
  const oldTimeout = process.env.PAYMENT_PENDING_TIMEOUT_MINUTES;

  beforeEach(() => {
    orderRepository.orders.clear();
    orderRepository.requests.clear();
    process.env.PAYMENT_PENDING_ORDER_LIMIT = '3';
    process.env.PAYMENT_PENDING_SCOPE = 'DINE_IN';
    process.env.PAYMENT_PENDING_TIMEOUT_MINUTES = '5';
  });

  after(() => {
    for (const [key, value] of Object.entries({
      PAYMENT_PENDING_ORDER_LIMIT: oldLimit,
      PAYMENT_PENDING_SCOPE: oldScope,
      PAYMENT_PENDING_TIMEOUT_MINUTES: oldTimeout
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.writeFileSync(ORDERS_FILE, originalOrdersFile, 'utf8');
  });

  it('chặn đơn thứ tư và mở slot sau khi hủy một đơn', async () => {
    await orderRepository.save(buildPendingOrder('FO-CAP-01'));
    await orderRepository.save(buildPendingOrder('FO-CAP-02'));
    await orderRepository.save(buildPendingOrder('FO-CAP-03'));

    const capacity = await orderService.getPaymentCapacityStatus();
    assert.equal(capacity.pendingCount, 3);
    assert.equal(capacity.blocked, true);

    await assert.rejects(
      () => orderService.assertPaymentCapacity('DINE_IN'),
      err => err.code === 'PAYMENT_CAPACITY_FULL' && err.pendingCount === 3
    );

    const cancelled = await orderService.cancelOrder('FO-CAP-02', 'FO-CAP-02');
    assert.equal(cancelled.orderStatus, 'CANCELLED');
    assert.equal(cancelled.paymentStatus, 'CANCELLED');
    assert.equal(cancelled.cancelReason, 'MANUAL_CANCEL');

    const available = await orderService.getPaymentCapacityStatus();
    assert.equal(available.pendingCount, 2);
    assert.equal(available.blocked, false);
  });

  it('tự hủy đơn quá 5 phút và giải phóng quota', async () => {
    await orderRepository.save(buildPendingOrder('FO-EXP-01', {
      createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString()
    }));

    const expired = await orderService.expireUnpaidOrders();
    assert.equal(expired.length, 1);

    const saved = await orderRepository.findById('FO-EXP-01');
    assert.equal(saved.orderStatus, 'CANCELLED');
    assert.equal(saved.paymentStatus, 'EXPIRED');
    assert.equal(saved.cancelReason, 'PAYMENT_TIMEOUT');
    assert.equal((await orderService.getPaymentCapacityStatus()).pendingCount, 0);
  });

  it('admin có thể hủy đơn chưa thanh toán và ghi nhận người thao tác', async () => {
    await orderRepository.save(buildPendingOrder('FO-ADMIN-CANCEL-01'));

    const cancelled = await orderService.adminCancelOrder('FO-ADMIN-CANCEL-01', {
      sub: 'admin-1',
      username: 'admin',
      role: 'admin'
    });

    assert.equal(cancelled.orderStatus, 'CANCELLED');
    assert.equal(cancelled.paymentStatus, 'CANCELLED');
    assert.equal(cancelled.cancelReason, 'ADMIN_CANCEL');
    assert.equal(cancelled.cancelledBy.username, 'admin');
  });

  it('retry tạo payload DINE_IN mới và giữ liên kết với đơn cũ', async () => {
    await orderRepository.save(buildPendingOrder('FO-RETRY-OLD', {
      orderStatus: 'CANCELLED',
      paymentStatus: 'EXPIRED',
      cancelReason: 'PAYMENT_TIMEOUT',
      items: [{
        productId: 'COM_GA',
        quantity: 2,
        customization: { excludedOptions: [{ id: 'NO_ONION', name: 'Không hành' }] }
      }]
    }));

    const originalProcessOrder = orderService.processOrder;
    let capturedPayload = null;
    orderService.processOrder = async payload => {
      capturedPayload = payload;
      return { statusCode: 201, result: { orderId: 'FO-RETRY-NEW', payment: { paymentStatus: 'PENDING' } } };
    };

    try {
      const result = await orderService.retryOrder('FO-RETRY-OLD', 'FO-RETRY-OLD', 'MOMO_QR');
      assert.equal(result.result.retryOfOrderId, 'FO-RETRY-OLD');
      assert.equal(capturedPayload.fulfillmentType, 'DINE_IN');
      assert.equal(capturedPayload.paymentMethod, 'MOMO_QR');
      assert.equal(capturedPayload.items[0].excludedOptionIds[0], 'NO_ONION');
      assert.notEqual(capturedPayload.requestId, 'FO-RETRY-OLD');
    } finally {
      orderService.processOrder = originalProcessOrder;
    }
  });

  it('báo cáo có doanh thu, đơn hủy, kênh nhận món và bucket theo giờ', async () => {
    await orderRepository.save(buildPendingOrder('FO-REPORT-DINE', {
      createdAt: '2026-08-12T10:15:00+07:00',
      isPaid: true,
      paymentStatus: 'PAID',
      fulfillmentType: 'DINE_IN',
      paidAt: '2026-08-12T10:16:00+07:00',
      items: [{ productId: 'COM_GA', name: 'Cơm gà', quantity: 1, unitPrice: 50000, itemTotal: 50000 }]
    }));
    await orderRepository.save(buildPendingOrder('FO-REPORT-DELIVERY', {
      createdAt: '2026-08-12T11:15:00+07:00',
      isPaid: true,
      paymentStatus: 'PAID',
      fulfillmentType: 'DELIVERY',
      paidAt: '2026-08-12T11:16:00+07:00',
      items: [{ productId: 'TRA_DAO', name: 'Trà đào', quantity: 2, unitPrice: 20000, itemTotal: 40000 }],
      totalAmount: 40000
    }));
    await orderRepository.save(buildPendingOrder('FO-REPORT-CANCEL', {
      createdAt: '2026-08-12T12:15:00+07:00',
      orderStatus: 'CANCELLED',
      paymentStatus: 'EXPIRED',
      cancelReason: 'PAYMENT_TIMEOUT',
      cancelledAt: '2026-08-12T12:20:00+07:00'
    }));

    const report = await reportService.generateSalesReport('today', new Date('2026-08-12T14:00:00+07:00'));
    assert.equal(report.summary.paidOrderCount, 2);
    assert.equal(report.summary.revenue, 90000);
    assert.equal(report.summary.dineInOrderCount, 2);
    assert.equal(report.summary.deliveryOrderCount, 1);
    assert.equal(report.summary.cancelledOrderCount, 1);
    assert.equal(report.summary.autoCancelledOrderCount, 1);
    assert.equal(report.hourlyOrders[10].totalOrderCount, 1);
    assert.equal(report.hourlyOrders[12].cancelledOrderCount, 1);
  });
});
