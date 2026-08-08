const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderRepository = require('../src/repositories/order-repository');
const orderService = require('../src/services/order-service');

describe('Order Repository & Service Pagination Tests', () => {
  beforeEach(() => {
    orderRepository.orders.clear();
    orderRepository.requests.clear();
  });

  it('Trả về orders rỗng và metadata chuẩn khi không có đơn hàng', async () => {
    const result = await orderRepository.getPaginated({ page: 1, limit: 10 });
    assert.deepEqual(result.orders, []);
    assert.equal(result.pagination.page, 1);
    assert.equal(result.pagination.limit, 10);
    assert.equal(result.pagination.totalOrders, 0);
    assert.equal(result.pagination.totalPages, 1);
  });

  it('Phân trang đúng với 25 đơn hàng (page=1, limit=10)', async () => {
    const baseTime = new Date('2026-08-01T10:00:00Z').getTime();
    for (let i = 1; i <= 25; i++) {
      const id = `FO-TEST-${String(i).padStart(4, '0')}`;
      orderRepository.orders.set(id, {
        id,
        createdAt: new Date(baseTime + i * 1000).toISOString(),
        totalAmount: i * 10000
      });
    }

    const page1 = await orderRepository.getPaginated({ page: 1, limit: 10 });
    assert.equal(page1.orders.length, 10);
    assert.equal(page1.pagination.totalOrders, 25);
    assert.equal(page1.pagination.totalPages, 3);
    assert.equal(page1.orders[0].id, 'FO-TEST-0025'); // Mới nhất lên đầu

    const page3 = await orderRepository.getPaginated({ page: 3, limit: 10 });
    assert.equal(page3.orders.length, 5);
    assert.equal(page3.pagination.page, 3);
    assert.equal(page3.orders[4].id, 'FO-TEST-0001');
  });

  it('Trang vượt quá totalPages trả orders rỗng không phát sinh lỗi', async () => {
    orderRepository.orders.set('FO-TEST-0001', { id: 'FO-TEST-0001', createdAt: new Date().toISOString() });
    const result = await orderRepository.getPaginated({ page: 99, limit: 10 });
    assert.deepEqual(result.orders, []);
    assert.equal(result.pagination.page, 99);
    assert.equal(result.pagination.totalOrders, 1);
    assert.equal(result.pagination.totalPages, 1);
  });

  it('Xử lý an toàn với các tham số page và limit không hợp lệ tại OrderService', async () => {
    for (let i = 1; i <= 5; i++) {
      orderRepository.orders.set(`FO-TEST-${i}`, { id: `FO-TEST-${i}`, createdAt: new Date().toISOString() });
    }

    // Input âm, 0, chuỗi chữ
    const r1 = await orderService.getAllOrders({ page: 0, limit: -5 });
    assert.equal(r1.pagination.page, 1);
    assert.equal(r1.pagination.limit, 10);

    const r2 = await orderService.getAllOrders({ page: 'abc', limit: 'xyz' });
    assert.equal(r2.pagination.page, 1);
    assert.equal(r2.pagination.limit, 10);

    // Limit quá 100 bị cap ở 100
    const r3 = await orderService.getAllOrders({ page: 1, limit: 1000 });
    assert.equal(r3.pagination.limit, 100);
  });

  it('Sắp xếp ổn định khi các đơn hàng có cùng createdAt', async () => {
    const sameTime = '2026-08-01T12:00:00.000Z';
    orderRepository.orders.set('FO-2026-0001', { id: 'FO-2026-0001', createdAt: sameTime });
    orderRepository.orders.set('FO-2026-0002', { id: 'FO-2026-0002', createdAt: sameTime });
    orderRepository.orders.set('FO-2026-0003', { id: 'FO-2026-0003', createdAt: sameTime });

    const res = await orderRepository.getPaginated({ page: 1, limit: 10 });
    assert.equal(res.orders[0].id, 'FO-2026-0003');
    assert.equal(res.orders[1].id, 'FO-2026-0002');
    assert.equal(res.orders[2].id, 'FO-2026-0001');
  });

  it('Không làm biến đổi hoặc xóa thứ tự trong this.orders khi phân trang', async () => {
    orderRepository.orders.set('FO-1', { id: 'FO-1', createdAt: '2026-08-01T10:00:00Z' });
    orderRepository.orders.set('FO-2', { id: 'FO-2', createdAt: '2026-08-01T11:00:00Z' });

    const mapKeysBefore = Array.from(orderRepository.orders.keys());
    await orderRepository.getPaginated({ page: 1, limit: 1 });
    const mapKeysAfter = Array.from(orderRepository.orders.keys());

    assert.deepEqual(mapKeysBefore, mapKeysAfter);
  });
});
