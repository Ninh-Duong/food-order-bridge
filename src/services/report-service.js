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

    if (period === 'date') {
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
    if (!['today', 'date', 'week', 'month'].includes(period)) {
      throw { status: 400, message: 'Bộ lọc báo cáo không hợp lệ' };
    }

    const { from, to, timezone } = this.getRangeForPeriod(period, referenceDate);
    const fromJS = from.toJSDate();
    const toJS = to.toJSDate();

    const [paidOrders, createdOrders, cancelledOrders] = await Promise.all([
      orderRepository.getPaidOrdersByRange({ from: fromJS, to: toJS }),
      orderRepository.getOrdersByCreatedRange({ from: fromJS, to: toJS }),
      orderRepository.getCancelledOrdersByRange({ from: fromJS, to: toJS })
    ]);

    const summary = {
      paidOrderCount: 0,
      totalQuantitySold: 0,
      subtotalAmount: 0,
      discountAmount: 0,
      revenue: 0,
      totalOrderCount: createdOrders.length,
      cancelledOrderCount: cancelledOrders.length,
      autoCancelledOrderCount: cancelledOrders.filter(order => order.cancelReason === 'PAYMENT_TIMEOUT').length,
      manuallyCancelledOrderCount: cancelledOrders.filter(order => order.cancelReason !== 'PAYMENT_TIMEOUT').length,
      dineInOrderCount: createdOrders.filter(order => order.fulfillmentType === 'DINE_IN').length,
      deliveryOrderCount: createdOrders.filter(order => order.fulfillmentType !== 'DINE_IN').length
    };

    const hourlyOrders = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      totalOrderCount: 0,
      paidOrderCount: 0,
      cancelledOrderCount: 0,
      pendingOrderCount: 0
    }));

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

    if (period === 'today' || period === 'date') {
      for (const order of createdOrders) {
        const created = DateTime.fromJSDate(new Date(order.createdAt)).setZone(timezone);
        const bucket = hourlyOrders[created.hour];
        if (!bucket) continue;
        bucket.totalOrderCount += 1;
        if (order.isPaid === true) bucket.paidOrderCount += 1;
        else if (order.orderStatus === 'CANCELLED') bucket.cancelledOrderCount += 1;
        else bucket.pendingOrderCount += 1;
      }
    }

    const nowDt = DateTime.fromJSDate(referenceDate).setZone(timezone);

    return {
      filter: period,
      timezone,
      from: from.toISO(),
      to: to.toISO(),
      generatedAt: nowDt.toISO(),
      reportDate: from.toFormat('dd/MM/yyyy'),
      summary,
      products,
      hourlyOrders: period === 'today' || period === 'date' ? hourlyOrders : []
    };
  }
}

module.exports = new ReportService();
