const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CATEGORIES_FILE = path.join(__dirname, '..', 'src', 'data', 'categories.json');
const MENU_FILE = path.join(__dirname, '..', 'src', 'data', 'menu.json');

let originalCategoriesBackup = null;
let originalMenuBackup = null;

describe('MenuService Category Integration Tests', () => {
  let menuService;
  let categoryService;

  before(() => {
    if (fs.existsSync(CATEGORIES_FILE)) {
      originalCategoriesBackup = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    }
    if (fs.existsSync(MENU_FILE)) {
      originalMenuBackup = fs.readFileSync(MENU_FILE, 'utf8');
    }

    menuService = require('../src/services/menu-service');
    categoryService = require('../src/services/category-service');
  });

  after(() => {
    if (originalCategoriesBackup !== null) {
      fs.writeFileSync(CATEGORIES_FILE, originalCategoriesBackup, 'utf8');
    }
    if (originalMenuBackup !== null) {
      fs.writeFileSync(MENU_FILE, originalMenuBackup, 'utf8');
    }
  });

  it('Tạo món thành công với categoryId hợp lệ và tự động gán snapshot tên danh mục từ server', async () => {
    const timeId = Date.now();
    const catId = 'TEST_MENU_CAT_' + timeId;
    await categoryService.createCategory({
      id: catId,
      name: 'Món Cuốn Gỏi',
      active: true
    });

    const newItemId = 'ITEM_TEST_' + timeId;
    const savedItem = await menuService.saveMenuItem({
      id: newItemId,
      name: 'Gỏi Cuốn Tôm Thịt',
      categoryId: catId,
      category: 'Tên Giả Do Client Gửi', // Should be ignored
      price: 35000
    });

    assert.equal(savedItem.id, newItemId);
    assert.equal(savedItem.categoryId, catId);
    assert.equal(savedItem.category, 'Món Cuốn Gỏi'); // Authoritative snapshot
    assert.equal(savedItem.price, 35000);
  });

  it('Từ chối tạo món với categoryId không tồn tại', async () => {
    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'ITEM_INVALID_CAT',
          name: 'Món ăn không hợp lệ',
          categoryId: 'NON_EXISTENT_CAT_ID',
          price: 50000
        });
      },
      (err) => err.message.includes('không tồn tại')
    );
  });

  it('Từ chối tạo món mới với categoryId đang bị tắt (inactive)', async () => {
    const timeId = Date.now();
    const catId = 'INACTIVE_CAT_' + timeId;
    await categoryService.createCategory({
      id: catId,
      name: 'Danh Mục Ngưng Bán',
      active: false
    });

    await assert.rejects(
      async () => {
        await menuService.saveMenuItem({
          id: 'ITEM_INACTIVE_CAT_' + timeId,
          name: 'Món ăn',
          categoryId: catId,
          price: 40000
        });
      },
      (err) => err.message.includes('đang bị tắt')
    );
  });

  it('Đọc danh sách menu chứa món legacy không bị lỗi', async () => {
    const items = await menuService.getMenu();
    assert(Array.isArray(items));
    assert(items.length > 0);
  });
});
