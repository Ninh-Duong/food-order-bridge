const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock localStorage/window if needed for ES modules
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ appendChild: () => {}, remove: () => {}, classList: { add: () => {}, remove: () => {} }, style: {} }),
    body: { appendChild: () => {} }
  };
}

const { buildCustomizationSignature, cart } = require('../public/js/storefront/cart.js');

describe('Cart Customization & Line-based Signature Tests', () => {
  beforeEach(() => {
    cart.clear();
  });

  it('buildCustomizationSignature: Không phụ thuộc thứ tự excluded ID và tự động uppercase', () => {
    const sig1 = buildCustomizationSignature('COM_GA', ['HANH_PHI', 'TOI_PHI']);
    const sig2 = buildCustomizationSignature('COM_GA', ['toi_phi', 'hanh_phi']);
    assert.equal(sig1, 'COM_GA::HANH_PHI,TOI_PHI');
    assert.equal(sig2, 'COM_GA::HANH_PHI,TOI_PHI');
    assert.equal(sig1, sig2);

    const sigEmpty = buildCustomizationSignature('COM_GA', []);
    assert.equal(sigEmpty, 'COM_GA');
  });

  it('addConfiguredItem: Hai cấu hình khác nhau tạo thành 2 dòng riêng biệt', () => {
    const item = { id: 'COM_GA', name: 'Cơm gà', price: 50000, stockQuantity: 10 };

    cart.addConfiguredItem(item, 1, ['HANH_PHI']);
    cart.addConfiguredItem(item, 1, ['TOI_PHI']);

    assert.equal(cart.items.size, 2);
    assert.equal(cart.getTotalCount(), 2);
    assert.equal(cart.getProductTotalQuantity('COM_GA'), 2);
  });

  it('addConfiguredItem: Hai cấu hình giống nhau được gom (merge) số lượng vào cùng 1 dòng', () => {
    const item = { id: 'COM_GA', name: 'Cơm gà', price: 50000, stockQuantity: 10 };

    cart.addConfiguredItem(item, 1, ['HANH_PHI']);
    cart.addConfiguredItem(item, 2, ['hanh_phi']); // Cùng option 'HANH_PHI'

    assert.equal(cart.items.size, 1);
    assert.equal(cart.getTotalCount(), 3);
    assert.equal(cart.getProductTotalQuantity('COM_GA'), 3);
  });

  it('addConfiguredItem: Kiểm tra tổng tồn kho trên tất cả cấu hình của cùng 1 món', () => {
    const item = { id: 'COM_GA', name: 'Cơm gà', price: 50000, stockQuantity: 5 };

    // Thêm 3x không hành phi, 2x không tỏi phi -> tổng 5
    assert.equal(cart.addConfiguredItem(item, 3, ['HANH_PHI']), true);
    assert.equal(cart.addConfiguredItem(item, 2, ['TOI_PHI']), true);
    assert.equal(cart.getProductTotalQuantity('COM_GA'), 5);

    // Thêm tiếp 1x không dưa leo -> Vượt tổng stock (5), bị từ chối
    assert.equal(cart.addConfiguredItem(item, 1, ['DUA_LEO']), false);
    assert.equal(cart.getProductTotalQuantity('COM_GA'), 5);
  });

  it('getPayloadItems: Trả về danh sách payload chính xác kèm excludedOptionIds', () => {
    const item = { id: 'COM_GA', name: 'Cơm gà', price: 50000, stockQuantity: 10 };
    cart.addConfiguredItem(item, 2, ['HANH_PHI', 'TOI_PHI']);

    const payload = cart.getPayloadItems();
    assert.equal(payload.length, 1);
    assert.equal(payload[0].productId, 'COM_GA');
    assert.equal(payload[0].quantity, 2);
    assert.deepEqual(payload[0].excludedOptionIds, ['HANH_PHI', 'TOI_PHI']);
  });
});
