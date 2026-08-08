const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Admin Invoice Renderer Tests', () => {
  it('renderInvoiceHTML: Render đơn hàng chuẩn đầy đủ thông tin (đã thanh toán)', async () => {
    const { renderInvoiceHTML } = await import('../public/js/admin/invoice-renderer.js');

    const order = {
      id: 'FO-20260808-0001',
      createdAt: '2026-08-08T18:45:00.000Z',
      isPaid: true,
      paidAt: '2026-08-08T18:50:00.000Z',
      customer: {
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        address: '12 Nguyễn Trãi, Quận 5',
        note: 'Giao trước 19:15'
      },
      items: [
        {
          productId: 'COM_GA',
          name: 'Cơm gà',
          quantity: 2,
          unitPrice: 80000,
          originalUnitPrice: 100000,
          discountPercent: 20,
          itemTotal: 160000,
          customization: {
            excludedOptions: [
              { id: 'HANH_PHI', name: 'Hành phi' },
              { id: 'TOI_PHI', name: 'Tỏi phi' }
            ]
          }
        },
        {
          productId: 'TRA_DAO',
          name: 'Trà đào',
          quantity: 1,
          unitPrice: 25000,
          originalUnitPrice: 25000,
          discountPercent: 0,
          itemTotal: 25000
        }
      ],
      subtotalAmount: 225000,
      discountAmount: 40000,
      totalAmount: 185000
    };

    const html = renderInvoiceHTML(order, { shopName: 'CỬA HÀNG CƠM GÀ' });

    assert.ok(html.includes('CỬA HÀNG CƠM GÀ'));
    assert.ok(html.includes('HÓA ĐƠN BÁN HÀNG'));
    assert.ok(html.includes('FO-20260808-0001'));
    assert.ok(html.includes('Nguyễn Văn A'));
    assert.ok(html.includes('0901234567'));
    assert.ok(html.includes('12 Nguyễn Trãi, Quận 5'));
    assert.ok(html.includes('ĐÃ THANH TOÁN'));

    // Món 1 có giảm giá và không lấy
    assert.ok(html.includes('Cơm gà'));
    assert.ok(html.includes('2 × 80.000đ'));
    assert.ok(html.includes('160.000đ'));
    assert.ok(html.includes('Giá gốc: 100.000đ · Giảm 20%'));
    assert.ok(html.includes('Không lấy: Hành phi, Tỏi phi'));

    // Món 2 không có giảm giá
    assert.ok(html.includes('Trà đào'));
    assert.ok(html.includes('1 × 25.000đ'));

    // Tổng tiền
    assert.ok(html.includes('Tạm tính:'));
    assert.ok(html.includes('225.000đ'));
    assert.ok(html.includes('Khuyến mãi:'));
    assert.ok(html.includes('-40.000đ'));
    assert.ok(html.includes('TỔNG THANH TOÁN:'));
    assert.ok(html.includes('185.000đ'));

    // Ghi chú & Lời cảm ơn
    assert.ok(html.includes('Giao trước 19:15'));
    assert.ok(html.includes('Cảm ơn quý khách'));
  });

  it('renderInvoiceHTML: Không cho phép render hóa đơn in của đơn chưa thanh toán', async () => {
    const { renderInvoiceHTML } = await import('../public/js/admin/invoice-renderer.js');

    const unpaidOrder = {
      id: 'FO-UNPAID-001',
      isPaid: false,
      totalAmount: 100000
    };

    const html = renderInvoiceHTML(unpaidOrder);
    assert.ok(html.includes('Đơn hàng chưa thanh toán, không thể in hóa đơn'));
  });

  it('renderInvoiceHTML: Không hiển thị dòng giảm giá nếu discountPercent = 0', async () => {
    const { renderInvoiceHTML } = await import('../public/js/admin/invoice-renderer.js');

    const order = {
      id: 'FO-20260808-0002',
      createdAt: new Date().toISOString(),
      isPaid: true,
      customer: { name: 'Trần Văn B' },
      items: [
        {
          productId: 'PHO_BO',
          name: 'Phở Bò Tái Nạm',
          quantity: 1,
          unitPrice: 55000,
          originalUnitPrice: 55000,
          discountPercent: 0,
          itemTotal: 55000
        }
      ],
      subtotalAmount: 55000,
      discountAmount: 0,
      totalAmount: 55000
    };

    const html = renderInvoiceHTML(order);

    assert.ok(!html.includes('Giá gốc:'));
    assert.ok(!html.includes('Khuyến mãi:'));
    assert.ok(html.includes('TỔNG THANH TOÁN:'));
    assert.ok(html.includes('55.000đ'));
  });

  it('renderInvoiceHTML: Hỗ trợ món miễn phí (unitPrice = 0)', async () => {
    const { renderInvoiceHTML } = await import('../public/js/admin/invoice-renderer.js');

    const order = {
      id: 'FO-20260808-0003',
      createdAt: new Date().toISOString(),
      isPaid: true,
      customer: { name: 'Khách Quà Tặng' },
      items: [
        {
          productId: 'FREE_DRINK',
          name: 'Nước Ngọt Miễn Phí',
          quantity: 1,
          unitPrice: 0,
          originalUnitPrice: 15000,
          discountPercent: 100,
          itemTotal: 0
        }
      ],
      subtotalAmount: 15000,
      discountAmount: 15000,
      totalAmount: 0
    };

    const html = renderInvoiceHTML(order);

    assert.ok(html.includes('Nước Ngọt Miễn Phí'));
    assert.ok(html.includes('1 × 0đ'));
    assert.ok(html.includes('TỔNG THANH TOÁN:'));
    assert.ok(html.includes('0đ'));
  });

  it('renderInvoiceHTML: Xử lý an toàn đơn hàng legacy (thiếu snapshot một số trường)', async () => {
    const { renderInvoiceHTML } = await import('../public/js/admin/invoice-renderer.js');

    const legacyOrder = {
      id: 'FO-LEGACY-001',
      createdAt: '2026-08-01T10:00:00.000Z',
      isPaid: true,
      customerName: 'Khách Cũ',
      phone: '0911223344',
      address: '789 Nguyễn Huệ',
      items: [
        {
          productId: 'BUN_CHA',
          name: 'Bún Chả',
          quantity: 2,
          originalUnitPrice: 45000
        }
      ],
      totalPrice: 90000
    };

    const html = renderInvoiceHTML(legacyOrder);

    assert.ok(html.includes('FO-LEGACY-001'));
    assert.ok(html.includes('Khách Cũ'));
    assert.ok(html.includes('0911223344'));
    assert.ok(html.includes('2 × 45.000đ'));
    assert.ok(html.includes('90.000đ'));
    assert.ok(!html.includes('NaN'));
    assert.ok(!html.includes('undefined'));
  });

  it('renderInvoiceHTML: Escape HTML phòng chống XSS trong dữ liệu', async () => {
    const { renderInvoiceHTML } = await import('../public/js/admin/invoice-renderer.js');

    const xssOrder = {
      id: 'FO-XSS-<script>',
      createdAt: new Date().toISOString(),
      isPaid: true,
      customer: {
        name: '<script>alert("hack_name")</script>',
        phone: '0900000000',
        address: '<img src=x onerror=alert("hack_addr")>',
        note: '<b>Note Hack</b>'
      },
      items: [
        {
          productId: 'XSS_ITEM',
          name: '<iframe src="malicious"></iframe>',
          quantity: 1,
          unitPrice: 10000,
          itemTotal: 10000,
          customization: {
            excludedOptions: [
              { id: 'OPT_XSS', name: '<style>body{display:none}</style>' }
            ]
          }
        }
      ],
      totalAmount: 10000
    };

    const html = renderInvoiceHTML(xssOrder);

    assert.ok(!html.includes('<script>alert("hack_name")</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;hack_name&quot;)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(&quot;hack_addr&quot;)&gt;'));
    assert.ok(html.includes('&lt;b&gt;Note Hack&lt;/b&gt;'));
    assert.ok(html.includes('&lt;iframe src=&quot;malicious&quot;&gt;&lt;/iframe&gt;'));
    assert.ok(html.includes('&lt;style&gt;body{display:none}&lt;/style&gt;'));
  });

  it('renderInvoiceHTML: Xử lý order null hoặc thiếu items không bị crash', async () => {
    const { renderInvoiceHTML } = await import('../public/js/admin/invoice-renderer.js');

    const emptyOrderHtml = renderInvoiceHTML(null);
    assert.ok(emptyOrderHtml.includes('Không có dữ liệu đơn hàng.'));

    const noItemsOrderHtml = renderInvoiceHTML({ id: 'FO-EMPTY', isPaid: true, items: [] });
    assert.ok(noItemsOrderHtml.includes('Không có dữ liệu món ăn.'));
  });
});
