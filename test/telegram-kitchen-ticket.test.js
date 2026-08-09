const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatKitchenTicket,
  formatCustomerSection,
  formatPaymentSection,
  splitTelegramMessage
} = require('../src/services/telegram-service');

describe('Telegram Kitchen Ticket Formatter Tests', () => {
  it('formatKitchenTicket: Đơn hàng có món bỏ thành phần (KHÔNG LẤY)', () => {
    const order = {
      id: 'FO-20260808-0001',
      createdAt: '2026-08-08T18:45:00.000Z',
      customer: {
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        address: '12 Nguyễn Trãi, Quận 5',
        note: 'Giao trước 19:15. Gói riêng nước.'
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
          productId: 'PHO_BO',
          name: 'Phở bò tái',
          quantity: 1,
          unitPrice: 55000,
          itemTotal: 55000,
          customization: {
            excludedOptions: [
              { id: 'HANH_LA', name: 'Hành lá' }
            ]
          }
        },
        {
          productId: 'TRA_DAO',
          name: 'Trà đào',
          quantity: 1,
          unitPrice: 25000,
          itemTotal: 25000
        }
      ],
      subtotalAmount: 280000,
      discountAmount: 40000,
      totalAmount: 240000
    };

    const ticket = formatKitchenTicket(order);

    assert.ok(ticket.includes('PHIẾU BẾP · ĐƠN #FO-20260808-0001'));
    assert.ok(ticket.includes('[1] 2 × CƠM GÀ'));
    assert.ok(ticket.includes('KHÔNG LẤY:'));
    assert.ok(ticket.includes('- Hành phi'));
    assert.ok(ticket.includes('- Tỏi phi'));
    assert.ok(ticket.includes('[2] 1 × PHỞ BÒ TÁI'));
    assert.ok(ticket.includes('- Hành lá'));
    assert.ok(ticket.includes('[3] 1 × TRÀ ĐÀO'));
    assert.ok(ticket.includes('GHI CHÚ CHUNG'));
    assert.ok(ticket.includes('Giao trước 19:15. Gói riêng nước.'));
    assert.ok(ticket.includes('HÌNH THỨC: 🛵 GIAO TẬN NƠI'));
    assert.ok(ticket.includes('KHÁCH HÀNG'));
    assert.ok(ticket.includes('Nguyễn Văn A · 0901234567'));
    assert.ok(ticket.includes('12 Nguyễn Trãi, Quận 5'));
    assert.ok(ticket.includes('TỔNG THANH TOÁN:        240.000đ'));
  });

  it('formatCustomerSection: Định dạng phần khách hàng giao tận nơi (DELIVERY)', () => {
    const order = {
      fulfillmentType: 'DELIVERY',
      customer: {
        name: 'Lê Thị B',
        phone: '0988776655',
        address: '456 Lê Lai, Quận 1'
      }
    };
    const text = formatCustomerSection(order);
    assert.equal(text, 'HÌNH THỨC: 🛵 GIAO TẬN NƠI\nKHÁCH HÀNG\nLê Thị B · 0988776655\n456 Lê Lai, Quận 1');
  });

  it('formatCustomerSection: Định dạng phần khách hàng dùng tại quán (DINE_IN)', () => {
    const order = {
      fulfillmentType: 'DINE_IN',
      customer: {
        name: 'Trần Văn C',
        phone: '0901112233',
        address: ''
      }
    };
    const text = formatCustomerSection(order);
    assert.equal(text, 'HÌNH THỨC: 🍽️ DÙNG TẠI QUÁN\nKHÁCH HÀNG\nTrần Văn C · 0901112233\nĐịa chỉ: Không yêu cầu');
    assert.ok(!text.includes('N/A'));
  });

  it('formatPaymentSection: Định dạng phần thanh toán khi có giảm giá', () => {
    const order = {
      subtotalAmount: 100000,
      discountAmount: 20000,
      totalAmount: 80000
    };
    const text = formatPaymentSection(order);
    assert.ok(text.includes('Tạm tính:               100.000đ'));
    assert.ok(text.includes('Khuyến mãi:             -20.000đ'));
    assert.ok(text.includes('TỔNG THANH TOÁN:        80.000đ'));
  });

  it('splitTelegramMessage: Chia nhỏ tin nhắn nếu dài hơn maxLen mà không vỡ dòng', () => {
    const longText = Array.from({ length: 100 }, (_, i) => `Dòng thứ ${i + 1} của phiếu bếp`).join('\n');
    const chunks = splitTelegramMessage(longText, 500);

    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 500);
    }
  });
});
