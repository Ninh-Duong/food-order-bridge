const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderRepository = require('../src/repositories/order-repository');
const orderService = require('../src/services/order-service');
const paymentService = require('../src/services/payment-service');

describe('Order Payment Repository & Service Tests', () => {
  beforeEach(async () => {
    orderRepository.orders.clear();
    orderRepository.requests.clear();
  });

  it('Đơn mới lưu mặc định isPaid = false, paidAt = null, paidBy = null', async () => {
    const orderData = {
      id: 'FO-TEST-PAY-01',
      requestId: 'req-pay-01',
      customerName: 'Nguyễn Văn A',
      phone: '0901234567',
      address: 'HCM',
      items: [{ productId: 'COM_GA', quantity: 1, unitPrice: 50000, itemTotal: 50000 }],
      totalAmount: 50000,
      notificationStatus: 'SENT'
    };

    const saved = await orderRepository.save(orderData);
    assert.equal(saved.isPaid, false);
    assert.equal(saved.paidAt, null);
    assert.equal(saved.paidBy, null);

    const fetched = await orderRepository.findById('FO-TEST-PAY-01');
    assert.equal(fetched.isPaid, false);
    assert.equal(fetched.paidAt, null);
    assert.equal(fetched.paidBy, null);
  });

  it('formatDoc() xử lý an toàn dữ liệu legacy thiếu isPaid', () => {
    const legacyDoc = {
      id: 'FO-LEGACY-999',
      requestId: 'req-legacy-999',
      customerName: 'Khách Cũ',
      phone: '0999999999',
      address: 'HN',
      items: [],
      totalPrice: 100000
    };

    const formatted = orderRepository.formatDoc(legacyDoc);
    assert.equal(formatted.isPaid, false);
    assert.equal(formatted.paidAt, null);
    assert.equal(formatted.paidBy, null);
  });

  it('Cập nhật trạng thái thanh toán từ chưa thanh toán sang đã thanh toán', async () => {
    const orderData = {
      id: 'FO-TEST-PAY-02',
      requestId: 'req-pay-02',
      customerName: 'Trần Văn B',
      phone: '0902222222',
      address: 'HN',
      items: [{ productId: 'TRA_DAO', quantity: 2, unitPrice: 20000, itemTotal: 40000 }],
      totalAmount: 40000,
      isPaid: false,
      paidAt: null,
      paidBy: null
    };

    await orderRepository.save(orderData);

    const actor = { sub: 'usr-123', username: 'staff01', role: 'staff' };
    const updated = await orderService.setPaymentStatus('FO-TEST-PAY-02', true, actor);

    assert.equal(updated.isPaid, true);
    assert.ok(updated.paidAt);
    assert.deepEqual(updated.paidBy, {
      userId: 'usr-123',
      username: 'staff01',
      role: 'staff'
    });

    const refetched = await orderRepository.findById('FO-TEST-PAY-02');
    assert.equal(refetched.isPaid, true);
    assert.ok(refetched.paidAt);
  });

  it('Chuyển từ đã thanh toán về chưa thanh toán xóa paidAt và paidBy', async () => {
    const orderData = {
      id: 'FO-TEST-PAY-03',
      requestId: 'req-pay-03',
      customerName: 'Lê Văn C',
      phone: '0903333333',
      address: 'DN',
      items: [],
      totalAmount: 30000,
      isPaid: true,
      paidAt: new Date().toISOString(),
      paidBy: { userId: 'usr-admin', username: 'admin01', role: 'admin' }
    };

    await orderRepository.save(orderData);

    const actor = { sub: 'usr-admin', username: 'admin01', role: 'admin' };
    const updated = await orderService.setPaymentStatus('FO-TEST-PAY-03', false, actor);

    assert.equal(updated.isPaid, false);
    assert.equal(updated.paidAt, null);
    assert.equal(updated.paidBy, null);
  });

  it('setPaymentStatus kiểm tra validation tham số isPaid', async () => {
    await assert.rejects(
      async () => {
        await orderService.setPaymentStatus('FO-TEST-PAY-01', 'true', { sub: '1' });
      },
      (err) => {
        return err.status === 400;
      }
    );
  });

  it('Tạo QR mock khi MoMo chưa có config và hoàn thành bằng nút test phía server', async () => {
    const oldMockEnabled = process.env.PAYMENT_MOCK_ENABLED;
    const oldPartnerCode = process.env.MOMO_PARTNER_CODE;
    const oldAccessKey = process.env.MOMO_ACCESS_KEY;
    const oldSecretKey = process.env.MOMO_SECRET_KEY;
    const oldIpnUrl = process.env.MOMO_IPN_URL;
    const oldRedirectUrl = process.env.MOMO_REDIRECT_URL;

    process.env.PAYMENT_MOCK_ENABLED = 'true';
    delete process.env.MOMO_PARTNER_CODE;
    delete process.env.MOMO_ACCESS_KEY;
    delete process.env.MOMO_SECRET_KEY;
    delete process.env.MOMO_IPN_URL;
    delete process.env.MOMO_REDIRECT_URL;

    try {
      const payment = await paymentService.createPaymentForOrder({
        orderId: 'FO-MOCK-01',
        amount: 65000,
        paymentMethod: 'MOMO_QR'
      });

      assert.equal(payment.isMock, true);
      assert.equal(payment.paymentStatus, 'PENDING');
      assert.match(payment.qrImageUrl, /^data:image\/png;base64,/);

      await orderRepository.save({
        id: 'FO-MOCK-01',
        requestId: 'req-mock-01',
        fulfillmentType: 'DINE_IN',
        customer: { name: '', phone: '', address: '', note: '' },
        items: [],
        totalAmount: 65000,
        paymentMethod: 'MOMO_QR',
        paymentProvider: 'MOCK',
        paymentStatus: 'PENDING',
        paymentMock: true,
        isPaid: false
      });

      const completed = await orderService.completeMockPayment('FO-MOCK-01');
      assert.equal(completed.isPaid, true);
      assert.equal(completed.paymentStatus, 'PAID');
      assert.equal(completed.paymentProvider, 'MOCK');
    } finally {
      for (const [key, value] of Object.entries({
        PAYMENT_MOCK_ENABLED: oldMockEnabled,
        MOMO_PARTNER_CODE: oldPartnerCode,
        MOMO_ACCESS_KEY: oldAccessKey,
        MOMO_SECRET_KEY: oldSecretKey,
        MOMO_IPN_URL: oldIpnUrl,
        MOMO_REDIRECT_URL: oldRedirectUrl
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
