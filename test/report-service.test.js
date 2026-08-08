const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const orderRepository = require('../src/repositories/order-repository');
const reportService = require('../src/services/report-service');

describe('ReportService Sales Aggregation Tests', () => {
  const mockRefDate = new Date('2026-08-09T14:00:00+07:00');

  beforeEach(() => {
    orderRepository.orders.clear();
    orderRepository.requests.clear();
  });

  it('Chỉ tính các đơn có isPaid === true và dựa theo mốc paidAt', async () => {
    // Order 1: Paid today (2026-08-09 10:00)
    await orderRepository.save({
      id: 'FO-REP-01',
      requestId: 'req-rep-01',
      createdAt: '2026-08-08T10:00:00+07:00', // Created yesterday
      isPaid: true,
      paidAt: '2026-08-09T10:00:00+07:00', // Paid today
      paidBy: { userId: '1', username: 'staff1', role: 'staff' },
      items: [
        {
          productId: 'COM_GA',
          name: 'Cơm Gà',
          quantity: 2,
          unitPrice: 50000,
          originalUnitPrice: 50000,
          itemTotal: 100000
        }
      ],
      subtotalAmount: 100000,
      discountAmount: 0,
      totalAmount: 100000
    });

    // Order 2: Unpaid today
    await orderRepository.save({
      id: 'FO-REP-02',
      requestId: 'req-rep-02',
      createdAt: '2026-08-09T11:00:00+07:00',
      isPaid: false,
      paidAt: null,
      items: [
        {
          productId: 'TRA_DAO',
          name: 'Trà Đào',
          quantity: 5,
          unitPrice: 20000,
          itemTotal: 100000
        }
      ],
      subtotalAmount: 100000,
      discountAmount: 0,
      totalAmount: 100000
    });

    const report = await reportService.generateSalesReport('today', mockRefDate);

    assert.equal(report.summary.paidOrderCount, 1);
    assert.equal(report.summary.totalQuantitySold, 2);
    assert.equal(report.summary.revenue, 100000);
    assert.equal(report.products.length, 1);
    assert.equal(report.products[0].productId, 'COM_GA');
  });

  it('Tính đúng tổng giảm giá và doanh thu snapshot cho từng sản phẩm', async () => {
    await orderRepository.save({
      id: 'FO-REP-03',
      requestId: 'req-rep-03',
      isPaid: true,
      paidAt: '2026-08-09T12:00:00+07:00',
      items: [
        {
          productId: 'COM_GA',
          name: 'Cơm Gà Sốt Xối Mỡ',
          quantity: 2,
          originalUnitPrice: 60000,
          unitPrice: 50000,
          discountPercent: 16.67,
          itemSubtotalBeforeDiscount: 120000,
          discountAmount: 20000,
          itemTotal: 100000
        },
        {
          productId: 'TRA_DAO',
          name: 'Trà Đào Cam Sả',
          quantity: 1,
          originalUnitPrice: 30000,
          unitPrice: 30000,
          discountPercent: 0,
          itemSubtotalBeforeDiscount: 30000,
          discountAmount: 0,
          itemTotal: 30000
        }
      ],
      subtotalAmount: 150000,
      discountAmount: 20000,
      totalAmount: 130000
    });

    const report = await reportService.generateSalesReport('today', mockRefDate);

    assert.equal(report.summary.paidOrderCount, 1);
    assert.equal(report.summary.totalQuantitySold, 3);
    assert.equal(report.summary.subtotalAmount, 150000);
    assert.equal(report.summary.discountAmount, 20000);
    assert.equal(report.summary.revenue, 130000);

    // Sắp xếp theo revenue giảm dần: Cơm Gà (100k) -> Trà Đào (30k)
    assert.equal(report.products[0].productId, 'COM_GA');
    assert.equal(report.products[0].revenue, 100000);
    assert.equal(report.products[0].discountAmount, 20000);

    assert.equal(report.products[1].productId, 'TRA_DAO');
    assert.equal(report.products[1].revenue, 30000);
  });

  it('Trả về chỉ số bằng 0 khi không có đơn hàng đã thanh toán', async () => {
    const report = await reportService.generateSalesReport('today', mockRefDate);

    assert.equal(report.summary.paidOrderCount, 0);
    assert.equal(report.summary.totalQuantitySold, 0);
    assert.equal(report.summary.subtotalAmount, 0);
    assert.equal(report.summary.discountAmount, 0);
    assert.equal(report.summary.revenue, 0);
    assert.deepEqual(report.products, []);
  });

  it('Từ chối period không hợp lệ với lỗi HTTP 400', async () => {
    await assert.rejects(
      async () => {
        await reportService.generateSalesReport('year', mockRefDate);
      },
      (err) => err.status === 400
    );
  });
});
