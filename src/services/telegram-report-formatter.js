const { DateTime } = require('luxon');

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('vi-VN') + 'đ';
}

function formatSalesReport(report) {
  const isToday = report.filter === 'today';
  const isWeek = report.filter === 'week';
  const title = isToday
    ? '📊 BÁO CÁO DOANH THU HÔM NAY'
    : isWeek
      ? '📅 BÁO CÁO DOANH THU TUẦN NÀY'
      : '📅 BÁO CÁO DOANH THU THÁNG NÀY';

  const dt = report.generatedAt
    ? DateTime.fromISO(report.generatedAt).setZone(report.timezone || 'Asia/Ho_Chi_Minh')
    : DateTime.now().setZone(report.timezone || 'Asia/Ho_Chi_Minh');

  const timeStr = dt.toFormat('dd/MM/yyyy HH:mm');

  const summary = report.summary || {};
  const paidOrders = summary.paidOrderCount || 0;
  const itemsSold = summary.totalQuantitySold || 0;
  const subtotal = formatCurrency(summary.subtotalAmount);
  const discount = formatCurrency(summary.discountAmount);
  const revenue = formatCurrency(summary.revenue);

  let msg = `<b>${title}</b>\n`;
  msg += `<i>🕒 Cập nhật: ${timeStr}</i>\n\n`;

  msg += `<b>Đơn đã thanh toán:</b> ${paidOrders}\n`;
  msg += `<b>Tổng đơn phát sinh:</b> ${summary.totalOrderCount || 0}\n`;
  msg += `<b>Đơn dùng tại quán:</b> ${summary.dineInOrderCount || 0}\n`;
  msg += `<b>Đơn giao tận nơi:</b> ${summary.deliveryOrderCount || 0}\n`;
  msg += `<b>Tổng đơn bị hủy:</b> ${summary.cancelledOrderCount || 0} (tự hủy: ${summary.autoCancelledOrderCount || 0}, thủ công: ${summary.manuallyCancelledOrderCount || 0})\n`;
  msg += `<b>Món đã bán:</b> ${itemsSold}\n`;
  msg += `<b>Tạm tính:</b> ${subtotal}\n`;
  if (summary.discountAmount > 0) {
    msg += `<b>Giảm giá:</b> -${discount}\n`;
  }
  msg += `<b>THU NHẬP RÒNG:</b> <code>${revenue}</code>\n\n`;

  const products = Array.isArray(report.products) ? report.products : [];
  if (products.length > 0) {
    msg += `<b>🏆 TOP MÓN BÁN CHẠY:</b>\n`;
    const topProducts = products.slice(0, 10);
    topProducts.forEach((p, idx) => {
      const name = escapeHtml(p.productName || p.name);
      const qty = p.quantitySold || 0;
      const rev = formatCurrency(p.revenue);
      msg += `${idx + 1}. <b>${name}</b> — ${qty} phần (<code>${rev}</code>)\n`;
    });
  } else {
    msg += `<i>Chưa có đơn hàng nào phát sinh trong kỳ này.</i>\n`;
  }

  return msg;
}

function formatInventoryReport(menuItems = [], lowStockThreshold = 5, timezone = 'Asia/Ho_Chi_Minh') {
  const dt = DateTime.now().setZone(timezone);
  const timeStr = dt.toFormat('dd/MM/yyyy HH:mm');

  const activeItems = menuItems.filter(item => item.isActive !== false);

  const outOfStock = [];
  const lowStock = [];
  const inStock = [];

  for (const item of activeItems) {
    const qty = Number(item.stockQuantity) || 0;
    if (qty <= 0) {
      outOfStock.push(item);
    } else if (qty <= lowStockThreshold) {
      lowStock.push(item);
    } else {
      inStock.push(item);
    }
  }

  const sortByQty = (a, b) => (Number(a.stockQuantity) || 0) - (Number(b.stockQuantity) || 0);
  outOfStock.sort((a, b) => escapeHtml(a.name).localeCompare(escapeHtml(b.name), 'vi'));
  lowStock.sort(sortByQty);
  inStock.sort(sortByQty);

  let msg = `<b>📦 BÁO CÁO TỒN KHO HIỆN TẠI</b>\n`;
  msg += `<i>🕒 Cập nhật: ${timeStr}</i>\n\n`;

  if (outOfStock.length > 0) {
    msg += `🔴 <b>HẾT HÀNG (${outOfStock.length}):</b>\n`;
    for (const item of outOfStock) {
      msg += `• <s>${escapeHtml(item.name)}</s> — <b>0</b>\n`;
    }
    msg += `\n`;
  }

  if (lowStock.length > 0) {
    msg += `🟠 <b>SẮP HẾT (≤ ${lowStockThreshold}):</b>\n`;
    for (const item of lowStock) {
      msg += `• <b>${escapeHtml(item.name)}</b> — <code>${item.stockQuantity}</code> phần\n`;
    }
    msg += `\n`;
  }

  if (inStock.length > 0) {
    msg += `🟢 <b>CÒN HÀNG (${inStock.length}):</b>\n`;
    for (const item of inStock) {
      msg += `• <b>${escapeHtml(item.name)}</b> — ${item.stockQuantity} phần\n`;
    }
    msg += `\n`;
  }

  if (activeItems.length === 0) {
    msg += `<i>Chưa có món ăn nào trong thực đơn.</i>\n\n`;
  }

  msg += `<b>Tổng số món:</b> ${activeItems.length} | 🔴 Hết: ${outOfStock.length} | 🟠 Sắp hết: ${lowStock.length}`;

  return msg;
}

function buildMenuReplyMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Hôm nay', callback_data: 'report:today' },
        { text: '📅 Tháng này', callback_data: 'report:month' }
      ],
      [
        { text: '📦 Tồn kho hiện tại', callback_data: 'inventory:current' },
        { text: '📅 Tuần này', callback_data: 'report:week' }
      ],
      [
        { text: '🔄 Làm mới Menu', callback_data: 'menu:home' }
      ]
    ]
  };
}

module.exports = {
  escapeHtml,
  formatCurrency,
  formatSalesReport,
  formatInventoryReport,
  buildMenuReplyMarkup
};
