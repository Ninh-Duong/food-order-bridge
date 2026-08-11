const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../src/services/order-service');
const orderRepository = require('../src/repositories/order-repository');
const menuRepository = require('../src/repositories/menu-repository');

describe('Order Fulfillment & Phone Validation Tests', () => {
  beforeEach(async () => {
    await orderRepository.clearAll();
    menuRepository.saveAll([
      {
        id: 'COM_GA',
        name: 'Cơm gà',
        category: 'Món chính',
        price: 50000,
        discountPercent: 0,
        stockQuantity: 100,
        active: true
      }
    ]);
  });

  it('Chấp nhận đơn DELIVERY với địa chỉ giao hàng hợp lệ', async () => {
    const res = await orderService.processOrder({
      requestId: 'req-deliv-001',
      fulfillmentType: 'DELIVERY',
      customer: {
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        address: '12 Nguyễn Trãi, Phường 5, Quận 5',
        note: ''
      },
      items: [{ productId: 'COM_GA', quantity: 1 }]
    });

    assert.ok([201, 202].includes(res.statusCode));
    assert.equal(res.result.fulfillmentType, 'DELIVERY');

    const saved = await orderRepository.findByRequestId('req-deliv-001');
    assert.equal(saved.fulfillmentType, 'DELIVERY');
    assert.equal(saved.customer.address, '12 Nguyễn Trãi, Phường 5, Quận 5');
  });

  it('Từ chối đơn DELIVERY thiếu địa chỉ hoặc chỉ gồm khoảng trắng (< 5 ký tự)', async () => {
    await assert.rejects(
      async () => {
        await orderService.processOrder({
          requestId: 'req-deliv-invalid-1',
          fulfillmentType: 'DELIVERY',
          customer: {
            name: 'Nguyễn Văn B',
            phone: '0901234567',
            address: '   ',
            note: ''
          },
          items: [{ productId: 'COM_GA', quantity: 1 }]
        });
      },
      (err) => {
        assert.equal(err.status, 422);
        assert.ok(err.message.includes('Vui lòng nhập địa chỉ giao hàng cụ thể'));
        return true;
      }
    );
  });

  it('Chấp nhận đơn DINE_IN không có địa chỉ hoặc địa chỉ rỗng và chuẩn hóa thành ""', async () => {
    const res = await orderService.processOrder({
      requestId: 'req-dinein-001',
      fulfillmentType: 'DINE_IN',
      customer: {
        name: 'Nguyễn Văn C',
        phone: '0901234567',
        address: 'Địa chỉ cố tình nhập',
        note: 'Dùng tại bàn 5'
      },
      items: [{ productId: 'COM_GA', quantity: 1 }]
    });

    assert.ok([201, 202].includes(res.statusCode));
    assert.equal(res.result.fulfillmentType, 'DINE_IN');

    const saved = await orderRepository.findByRequestId('req-dinein-001');
    assert.equal(saved.fulfillmentType, 'DINE_IN');
    assert.equal(saved.customer.address, '');
  });

  it('Chấp nhận đơn DINE_IN không có họ tên và số điện thoại', async () => {
    const res = await orderService.processOrder({
      requestId: 'req-dinein-no-contact',
      fulfillmentType: 'DINE_IN',
      customer: { address: '', note: 'Bàn 2' },
      items: [{ productId: 'COM_GA', quantity: 1 }]
    });

    assert.ok([201, 202].includes(res.statusCode));
    const saved = await orderRepository.findByRequestId('req-dinein-no-contact');
    assert.equal(saved.customer.name, '');
    assert.equal(saved.customer.phone, '');
  });

  it('Chuẩn hóa số điện thoại có dấu cách / dấu chấm / dấu gạch ngang (090 123 4567 -> 0901234567)', async () => {
    const res = await orderService.processOrder({
      requestId: 'req-phone-norm',
      fulfillmentType: 'DINE_IN',
      customer: {
        name: 'Khách test phone',
        phone: '090 123.45-67',
        address: '',
        note: ''
      },
      items: [{ productId: 'COM_GA', quantity: 1 }]
    });

    assert.ok([201, 202].includes(res.statusCode));
    const saved = await orderRepository.findByRequestId('req-phone-norm');
    assert.equal(saved.customer.phone, '0901234567');
  });

  it('Từ chối số điện thoại không đủ hoặc thừa số (9 số / 11 số)', async () => {
    // 9 số
    await assert.rejects(
      async () => {
        await orderService.processOrder({
          requestId: 'req-phone-9',
          fulfillmentType: 'DINE_IN',
          customer: { name: 'A', phone: '090123456', address: '' },
          items: [{ productId: 'COM_GA', quantity: 1 }]
        });
      },
      (err) => err.status === 422 && err.message.includes('10 chữ số')
    );

    // 11 số
    await assert.rejects(
      async () => {
        await orderService.processOrder({
          requestId: 'req-phone-11',
          fulfillmentType: 'DINE_IN',
          customer: { name: 'A', phone: '09012345678', address: '' },
          items: [{ productId: 'COM_GA', quantity: 1 }]
        });
      },
      (err) => err.status === 422 && err.message.includes('10 chữ số')
    );
  });

  it('Từ chối số điện thoại không bắt đầu bằng số 0', async () => {
    await assert.rejects(
      async () => {
        await orderService.processOrder({
          requestId: 'req-phone-non-zero',
          fulfillmentType: 'DINE_IN',
          customer: { name: 'A', phone: '1901234567', address: '' },
          items: [{ productId: 'COM_GA', quantity: 1 }]
        });
      },
      (err) => err.status === 422 && err.message.includes('bắt đầu bằng 0')
    );
  });

  it('Idempotency: Trả về đơn trùng requestId giữ nguyên fulfillmentType', async () => {
    const res1 = await orderService.processOrder({
      requestId: 'req-idemp-fulfillment',
      fulfillmentType: 'DINE_IN',
      customer: { name: 'A', phone: '0901234567', address: '' },
      items: [{ productId: 'COM_GA', quantity: 1 }]
    });

    const res2 = await orderService.processOrder({
      requestId: 'req-idemp-fulfillment',
      fulfillmentType: 'DELIVERY',
      customer: { name: 'A', phone: '0901234567', address: '123 Đường B' },
      items: [{ productId: 'COM_GA', quantity: 1 }]
    });

    assert.ok([201, 202].includes(res1.statusCode));
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.result.orderId, res1.result.orderId);
    assert.equal(res2.result.fulfillmentType, 'DINE_IN');
  });
});
