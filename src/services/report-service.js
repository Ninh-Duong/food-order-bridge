const { DateTime } = require('luxon');
const config = require('../config');
const orderRepository = require('../repositories/order-repository');

class ReportService {
  getTimezone() {
    return process.env.ORDER_TIMEZONE || config.ORDER_TIMEZONE || 'Asia/Ho_Chi_Minh';
  }

  getRangeForPeriod(period, referenceDate = new Date()) {
    const timezone = this.getTimezone();
    const dt = DateTime.fromJSDate(referenceDate).setZone(timezone);

    if (period === 'today') {
      const from = dt.startOf('day');
      const to = from.plus({ days: 1 });
      return { from, to, timezone };
    }

    if (period === 'week') {
      const from = dt.startOf('week'); // Monday 00:00:00
      const to = dt.startOf('day').plus({ days: 1 });
      return { from, to, timezone };
    }

    if (period === 'month') {
      const from = dt.startOf('month'); // 1st of month 00:00:00
      const to = dt.startOf('day').plus({ days: 1 });
      return { from, to, timezone };
    }

    throw { status: 400, message: 'Bộ lọc báo cáo không hợp lệ' };
  }

  async generateSalesReport(period = 'today', referenceDate = new Date()) {
    if (!['today', 'week', 'month'].includes(period)) {
      throw { status: 400, message: 'Bộ lọc báo cáo không hợp lệ' };
    }

    const { from, to, timezone } = this.getRangeForPeriod(period, referenceDate);
    const fromJS = from.toJSDate();
    const toJS = to.toJSDate();

    const paidOrders = await orderRepository.getPaidOrdersByRange({ from: fromJS, to: toJS });

    const summary = {
      paidOrderCount: 0,
      totalQuantitySold: 0,
      subtotalAmount: 0,
      discountAmount: 0,
      revenue: 0
    };

    const productMap = new Map();

    for (const order of paidOrders) {
      summary.paidOrderCount += 1;
      summary.subtotalAmount += Number(order.subtotalAmount) || 0;
      summary.discountAmount += Number(order.discountAmount) || 0;
      summary.revenue += Number(order.totalAmount ?? order.totalPrice) || 0;

      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        const quantity = Number(item.quantity) || 0;
        const originalUnitPrice = Number(item.originalUnitPrice ?? item.unitPrice) || 0;
        const unitPrice = Number(item.unitPrice ?? item.originalUnitPrice) || 0;

        const subtotal = Number(item.itemSubtotalBeforeDiscount ?? (originalUnitPrice * quantity)) || 0;
        const revenue = Number(item.itemTotal ?? (unitPrice * quantity)) || 0;
        const discount = Number(item.discountAmount ?? (subtotal - revenue)) || 0;

        summary.totalQuantitySold += quantity;

        const pId = item.productId || item.name || 'UNKNOWN';
        const pName = item.name || item.productId || 'Sản phẩm';

        if (!productMap.has(pId)) {
          productMap.set(pId, {
            productId: pId,
            productName: pName,
            quantitySold: 0,
            subtotalAmount: 0,
            discountAmount: 0,
            revenue: 0
          });
        }

        const pData = productMap.get(pId);
        pData.quantitySold += quantity;
        pData.subtotalAmount += subtotal;
        pData.discountAmount += discount;
        pData.revenue += revenue;
      }
    }

    const products = Array.from(productMap.values()).sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      if (b.quantitySold !== a.quantitySold) return b.quantitySold - a.quantitySold;
      return a.productName.localeCompare(b.productName, 'vi');
    });

    const nowDt = DateTime.fromJSDate(referenceDate).setZone(timezone);

    return {
      filter: period,
      timezone,
      from: from.toISO(),
      to: to.toISO(),
      generatedAt: nowDt.toISO(),
      summary,
      products
    };
  }
}

module.exports = new ReportService();
