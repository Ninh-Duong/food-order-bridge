const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeHtml,
  formatCurrency,
  formatSalesReport,
  formatInventoryReport,
  buildMenuReplyMarkup
} = require('../src/services/telegram-report-formatter');

describe('Telegram Report Formatter Tests', () => {
  it('escapeHtml: Chuyển đổi các ký tự HTML đặc biệt', () => {
    assert.equal(escapeHtml('Cơm gà <Đặc biệt> & Trà tắc'), 'Cơm gà &lt;Đặc biệt&gt; &amp; Trà tắc');
    assert.equal(escapeHtml(''), '');
  });

  it('formatCurrency: Định dạng số tiền VNĐ', () => {
    assert.equal(formatCurrency(8450000), '8.450.000đ');
    assert.equal(formatCurrency(0), '0đ');
  });

  it('formatSalesReport: Định dạng báo cáo hôm nay có doanh thu', () => {
    const reportData = {
      filter: 'today',
      timezone: 'Asia/Ho_Chi_Minh',
      generatedAt: '2026-08-10T14:30:00.000+07:00',
      summary: {
        paidOrderCount: 42,
        totalQuantitySold: 68,
        subtotalAmount: 9000000,
        discountAmount: 550000,
        revenue: 8450000
      },
      products: [
        { productName: 'Cơm gà', quantitySold: 18, revenue: 1440000 },
        { productName: 'Phở bò <Tái>', quantitySold: 12, revenue: 660000 }
      ]
    };

    const text = formatSalesReport(reportData);

    assert.ok(text.includes('📊 BÁO CÁO DOANH THU HÔM NAY'));
    assert.ok(text.includes('10/08/2026 14:30'));
    assert.ok(text.includes('<b>Đơn đã thanh toán:</b> 42'));
    assert.ok(text.includes('<b>Món đã bán:</b> 68'));
    assert.ok(text.includes('<b>Tạm tính:</b> 9.000.000đ'));
    assert.ok(text.includes('<b>Giảm giá:</b> -550.000đ'));
    assert.ok(text.includes('<b>THU NHẬP RÒNG:</b> <code>8.450.000đ</code>'));
    assert.ok(text.includes('TOP MÓN BÁN CHẠY:'));
    assert.ok(text.includes('1. <b>Cơm gà</b> — 18 phần (<code>1.440.000đ</code>)'));
    assert.ok(text.includes('2. <b>Phở bò &lt;Tái&gt;</b> — 12 phần (<code>660.000đ</code>)'));
  });

  it('formatSalesReport: Định dạng báo cáo không có đơn hàng', () => {
    const reportData = {
      filter: 'month',
      timezone: 'Asia/Ho_Chi_Minh',
      generatedAt: '2026-08-10T14:30:00.000+07:00',
      summary: { paidOrderCount: 0, totalQuantitySold: 0, subtotalAmount: 0, discountAmount: 0, revenue: 0 },
      products: []
    };

    const text = formatSalesReport(reportData);

    assert.ok(text.includes('📅 BÁO CÁO DOANH THU THÁNG NÀY'));
    assert.ok(text.includes('Chưa có đơn hàng nào phát sinh trong kỳ này.'));
  });

  it('formatInventoryReport: Phân loại tồn kho Hết hàng, Sắp hết, Còn hàng', () => {
    const menuItems = [
      { name: 'Bún chả', stockQuantity: 0, isActive: true },
      { name: 'Phở bò', stockQuantity: 2, isActive: true },
      { name: 'Trà đào', stockQuantity: 18, isActive: true },
      { name: 'Món đã ẩn', stockQuantity: 10, isActive: false }
    ];

    const text = formatInventoryReport(menuItems, 5, 'Asia/Ho_Chi_Minh');

    assert.ok(text.includes('📦 BÁO CÁO TỒN KHO HIỆN TẠI'));
    assert.ok(text.includes('🔴 <b>HẾT HÀNG (1):</b>'));
    assert.ok(text.includes('<s>Bún chả</s> — <b>0</b>'));
    assert.ok(text.includes('🟠 <b>SẮP HẾT (≤ 5):</b>'));
    assert.ok(text.includes('<b>Phở bò</b> — <code>2</code> phần'));
    assert.ok(text.includes('🟢 <b>CÒN HÀNG (1):</b>'));
    assert.ok(text.includes('<b>Trà đào</b> — 18 phần'));
    assert.ok(!text.includes('Món đã ẩn'));
    assert.ok(text.includes('<b>Tổng số món:</b> 3 | 🔴 Hết: 1 | 🟠 Sắp hết: 1'));
  });


  it('buildMenuReplyMarkup: Cấu trúc Inline Keyboard hợp lệ', () => {
    const markup = buildMenuReplyMarkup();
    assert.ok(Array.isArray(markup.inline_keyboard));
    assert.equal(markup.inline_keyboard.length, 4);
    assert.equal(markup.inline_keyboard[0][0].text, '📊 Hôm nay');
    assert.equal(markup.inline_keyboard[0][0].callback_data, 'report:today');
    assert.equal(markup.inline_keyboard[0][1].text, '📅 Tháng này');
    assert.equal(markup.inline_keyboard[0][1].callback_data, 'report:month');
    assert.equal(markup.inline_keyboard[1][0].text, '📅 Tuần này');
    assert.equal(markup.inline_keyboard[1][0].callback_data, 'report:week');
    assert.equal(markup.inline_keyboard[1][1].text, '📅 Theo ngày');
    assert.equal(markup.inline_keyboard[1][1].callback_data, 'report:date');
    assert.equal(markup.inline_keyboard[2][0].text, '📦 Tồn kho hiện tại');
    assert.equal(markup.inline_keyboard[2][0].callback_data, 'inventory:current');
    assert.equal(markup.inline_keyboard[3][0].text, '🔄 Làm mới Menu');
    assert.equal(markup.inline_keyboard[3][0].callback_data, 'menu:home');
  });
});
