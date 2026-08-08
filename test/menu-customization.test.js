const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const menuService = require('../src/services/menu-service');

describe('Menu Customization Options Tests', () => {
  it('serializeMenuItem: Trả về customizationOptions đúng format và sắp xếp theo sortOrder', () => {
    const rawItem = {
      id: 'COM_GA',
      name: 'Cơm gà',
      price: 50000,
      customizationOptions: [
        { id: 'NUOC_TUONG', name: 'Nước tương', sortOrder: 30 },
        { id: 'HANH_PHI', name: 'Hành phi', sortOrder: 10, defaultIncluded: true },
        { id: 'TOI_PHI', name: 'Tỏi phi', sortOrder: 20 }
      ]
    };

    const serialized = menuService.serializeMenuItem(rawItem);
    assert.ok(Array.isArray(serialized.customizationOptions));
    assert.equal(serialized.customizationOptions.length, 3);
    assert.equal(serialized.customizationOptions[0].id, 'HANH_PHI');
    assert.equal(serialized.customizationOptions[1].id, 'TOI_PHI');
    assert.equal(serialized.customizationOptions[2].id, 'NUOC_TUONG');
  });

  it('serializeMenuItem: Món legacy không có customizationOptions trả về mảng rỗng []', () => {
    const legacyItem = {
      id: 'LEGACY_ITEM',
      name: 'Món cũ',
      price: 30000
    };

    const serialized = menuService.serializeMenuItem(legacyItem);
    assert.deepEqual(serialized.customizationOptions, []);
  });

  it('saveMenuItem: Lưu món thành công với customizationOptions hợp lệ', async () => {
    const saved = await menuService.saveMenuItem({
      id: 'TEST_CUSTOM_ITEM',
      name: 'Món Test Customization',
      categoryId: 'COM_GA',
      price: 60000,
      stockQuantity: 10,
      customizationOptions: [
        { id: 'HANH_PHI', name: 'Hành phi', defaultIncluded: true, active: true, sortOrder: 10 },
        { id: 'TOI_PHI', name: 'Tỏi phi', defaultIncluded: true, active: true, sortOrder: 5 }
      ]
    });

    assert.equal(saved.id, 'TEST_CUSTOM_ITEM');
    assert.equal(saved.customizationOptions.length, 2);
    // Verified sorted by sortOrder (TOI_PHI=5 first, HANH_PHI=10 second)
    assert.equal(saved.customizationOptions[0].id, 'TOI_PHI');
    assert.equal(saved.customizationOptions[1].id, 'HANH_PHI');
  });

  it('saveMenuItem: Từ chối ID option không hợp lệ', async () => {
    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'TEST_CUSTOM_INVALID_ID',
          name: 'Món Test',
          categoryId: 'COM_GA',
          price: 50000,
          customizationOptions: [
            { id: 'Hành phi', name: 'Hành phi' } // ID chứa tiếng Việt có dấu
          ]
        });
      },
      (err) => err.message.includes('Mã tùy chọn') && err.message.includes('không hợp lệ')
    );
  });

  it('saveMenuItem: Từ chối trùng mã ID option trong cùng món', async () => {
    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'TEST_CUSTOM_DUP_ID',
          name: 'Món Test',
          categoryId: 'COM_GA',
          price: 50000,
          customizationOptions: [
            { id: 'HANH_PHI', name: 'Hành phi 1' },
            { id: 'HANH_PHI', name: 'Hành phi 2' }
          ]
        });
      },
      (err) => err.message.includes('bị trùng lặp trong cùng một món')
    );
  });

  it('saveMenuItem: Từ chối trùng tên thành phần trong cùng món (sau normalize)', async () => {
    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'TEST_CUSTOM_DUP_NAME',
          name: 'Món Test',
          categoryId: 'COM_GA',
          price: 50000,
          customizationOptions: [
            { id: 'HANH_PHI_1', name: 'Hành phi' },
            { id: 'HANH_PHI_2', name: '  Hành phi  ' }
          ]
        });
      },
      (err) => err.message.includes('bị trùng lặp trong cùng một món')
    );
  });

  it('saveMenuItem: Từ chối vượt quá 20 tùy chọn thành phần', async () => {
    const tooManyOptions = Array.from({ length: 21 }, (_, i) => ({
      id: `OPT_${i + 1}`,
      name: `Option ${i + 1}`
    }));

    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'TEST_CUSTOM_TOO_MANY',
          name: 'Món Quá Nhiều Option',
          categoryId: 'COM_GA',
          price: 50000,
          customizationOptions: tooManyOptions
        });
      },
      (err) => err.message.includes('Món ăn chỉ được có tối đa 20 tùy chọn thành phần')
    );
  });
});
