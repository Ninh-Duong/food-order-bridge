const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateSalePrice } = require('../src/utils/price-calculator');
const menuService = require('../src/services/menu-service');

describe('Menu Pricing & Sale Price Tests', () => {
  it('calculateSalePrice: Giảm 20% của 100.000đ trả 80.000đ', () => {
    assert.equal(calculateSalePrice(100000, 20), 80000);
  });

  it('calculateSalePrice: Giảm 0% giữ nguyên giá', () => {
    assert.equal(calculateSalePrice(50000, 0), 50000);
  });

  it('calculateSalePrice: Giảm 100% trả giá 0đ', () => {
    assert.equal(calculateSalePrice(45000, 100), 0);
  });

  it('calculateSalePrice: Làm tròn đúng quy ước Math.round', () => {
    // 35.000đ giảm 15% -> 35000 * 0.85 = 29750
    assert.equal(calculateSalePrice(35000, 15), 29750);
    // 100.000đ giảm 33% -> 67000
    assert.equal(calculateSalePrice(100000, 33), 67000);
  });

  it('calculateSalePrice: Giới hạn discountPercent trong phạm vi 0 - 100', () => {
    assert.equal(calculateSalePrice(50000, -10), 50000);
    assert.equal(calculateSalePrice(50000, 150), 0);
  });

  it('MenuService.saveMenuItem: Từ chối % giảm giá ngoài 0 - 100', async () => {
    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'TEST_PRICE_ITEM',
          name: 'Món Test',
          categoryId: 'COM_GA',
          price: 50000,
          discountPercent: 120,
          stockQuantity: 10
        });
      },
      (err) => err.message.includes('Phần trăm giảm giá phải là số từ 0 đến 100')
    );
  });

  it('MenuService.saveMenuItem: Từ chối tồn kho âm hoặc số thập phân', async () => {
    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'TEST_PRICE_ITEM',
          name: 'Món Test',
          categoryId: 'COM_GA',
          price: 50000,
          discountPercent: 10,
          stockQuantity: -5
        });
      },
      (err) => err.message.includes('Số lượng tồn kho phải là số nguyên không âm')
    );

    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'TEST_PRICE_ITEM',
          name: 'Món Test',
          categoryId: 'COM_GA',
          price: 50000,
          discountPercent: 10,
          stockQuantity: 2.5
        });
      },
      (err) => err.message.includes('Số lượng tồn kho phải là số nguyên không âm')
    );
  });

  it('MenuService.serializeMenuItem: Trả về đầy đủ salePrice và available', async () => {
    const serialized = menuService.serializeMenuItem({
      id: 'TEST_SERIALIZE',
      name: 'Món test serialize',
      price: 100000,
      discountPercent: 20,
      stockQuantity: 5,
      active: true
    });

    assert.equal(serialized.salePrice, 80000);
    assert.equal(serialized.available, true);

    const outOfStock = menuService.serializeMenuItem({
      id: 'TEST_SERIALIZE_OUT',
      name: 'Món hết kho',
      price: 100000,
      discountPercent: 10,
      stockQuantity: 0,
      active: true
    });

    assert.equal(outOfStock.available, false);
  });
});
