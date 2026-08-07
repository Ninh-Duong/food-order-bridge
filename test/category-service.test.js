const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CATEGORIES_FILE = path.join(__dirname, '..', 'src', 'data', 'categories.json');
const MENU_FILE = path.join(__dirname, '..', 'src', 'data', 'menu.json');

let originalCategoriesBackup = null;
let originalMenuBackup = null;

describe('CategoryService Unit Tests', () => {
  let categoryService;
  let categoryRepository;
  let menuRepository;

  before(() => {
    // Backup real data files before test suite
    if (fs.existsSync(CATEGORIES_FILE)) {
      originalCategoriesBackup = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    }
    if (fs.existsSync(MENU_FILE)) {
      originalMenuBackup = fs.readFileSync(MENU_FILE, 'utf8');
    }

    categoryService = require('../src/services/category-service');
    categoryRepository = require('../src/repositories/category-repository');
    menuRepository = require('../src/repositories/menu-repository');
  });

  after(() => {
    // Restore real data files after test suite
    if (originalCategoriesBackup !== null) {
      fs.writeFileSync(CATEGORIES_FILE, originalCategoriesBackup, 'utf8');
    }
    if (originalMenuBackup !== null) {
      fs.writeFileSync(MENU_FILE, originalMenuBackup, 'utf8');
    }
  });

  it('Tạo category hợp lệ với đầy đủ thông tin và slug tiếng Việt', async () => {
    const testCatId = 'TEST_CAT_' + Date.now();
    const created = await categoryService.createCategory({
      id: testCatId,
      name: '  Cơm Chiên Đặc Biệt  ',
      description: '  Nóng hổi vừa thổi vừa ăn  ',
      sortOrder: 15,
      active: true
    });

    assert.equal(created.id, testCatId);
    assert.equal(created.name, 'Cơm Chiên Đặc Biệt');
    assert.equal(created.slug, 'com-chien-dac-biet');
    assert.equal(created.description, 'Nóng hổi vừa thổi vừa ăn');
    assert.equal(created.sortOrder, 15);
    assert.equal(created.active, true);
  });

  it('Từ chối tên rỗng', async () => {
    await assert.rejects(
      async () => {
        await categoryService.createCategory({
          id: 'CAT_EMPTY_NAME',
          name: '   '
        });
      },
      { message: 'Tên danh mục không được để trống' }
    );
  });

  it('Từ chối ID không hợp lệ (có ký tự đặc biệt tiếng Việt hoặc ngắn hơn 2 ký tự)', async () => {
    await assert.rejects(
      async () => {
        await categoryService.createCategory({
          id: 'C@T!',
          name: 'Món ăn'
        });
      },
      { message: 'Mã danh mục chỉ được chứa chữ cái Latin, số và dấu gạch dưới (_)' }
    );

    await assert.rejects(
      async () => {
        await categoryService.createCategory({
          id: 'A',
          name: 'Món ăn'
        });
      },
      { message: 'Mã danh mục (ID) phải từ 2 đến 40 ký tự' }
    );
  });

  it('Từ chối sortOrder âm', async () => {
    await assert.rejects(
      async () => {
        await categoryService.createCategory({
          id: 'CAT_NEG_ORDER',
          name: 'Món lẩu',
          sortOrder: -5
        });
      },
      { message: 'Thứ tự hiển thị phải là số nguyên không âm' }
    );
  });

  it('Từ chối trùng ID', async () => {
    const testId = 'DUP_ID_' + Date.now();
    await categoryService.createCategory({
      id: testId,
      name: 'Danh mục A'
    });

    await assert.rejects(
      async () => {
        await categoryService.createCategory({
          id: testId,
          name: 'Danh mục B'
        });
      },
      (err) => err.message.includes('đã tồn tại')
    );
  });

  it('Từ chối trùng tên không phân biệt hoa/thường hoặc khoảng trắng', async () => {
    const uniqueSuffix = Date.now();
    const name1 = `Lẩu Hải Sản ${uniqueSuffix}`;
    const name2 = `  lẩu  hải  sản  ${uniqueSuffix}  `;

    await categoryService.createCategory({
      id: 'LAU_1_' + uniqueSuffix,
      name: name1
    });

    await assert.rejects(
      async () => {
        await categoryService.createCategory({
          id: 'LAU_2_' + uniqueSuffix,
          name: name2
        });
      },
      (err) => err.message.includes('đã tồn tại')
    );
  });

  it('Sửa tên category cập nhật snapshot name trên các món ăn thuộc categoryId đó', async () => {
    const testCatId = 'SNAP_CAT_' + Date.now();
    await categoryService.createCategory({
      id: testCatId,
      name: 'Tên Ban Đầu'
    });

    // Save menu item using testCatId
    await menuRepository.saveOrUpdate({
      id: 'ITEM_SNAP_' + Date.now(),
      name: 'Món test snapshot',
      categoryId: testCatId,
      category: 'Tên Ban Đầu',
      price: 30000,
      active: true
    });

    // Update category name
    await categoryService.updateCategory(testCatId, {
      name: 'Tên Đã Đổi'
    });

    // Check menu item snapshot name
    const items = await menuRepository.getByCategoryId(testCatId);
    assert.equal(items.length, 1);
    assert.equal(items[0].category, 'Tên Đã Đổi');
  });

  it('Toggle active chuyển đổi trạng thái chính xác', async () => {
    const testCatId = 'TOGGLE_CAT_' + Date.now();
    await categoryService.createCategory({
      id: testCatId,
      name: 'Món Ăn Vặt',
      active: true
    });

    const toggledOff = await categoryService.toggleCategoryActive(testCatId, false);
    assert.equal(toggledOff.active, false);

    const toggledOn = await categoryService.toggleCategoryActive(testCatId, true);
    assert.equal(toggledOn.active, true);
  });

  it('Không tìm thấy category trả lỗi đúng', async () => {
    await assert.rejects(
      async () => {
        await categoryService.updateCategory('NON_EXISTENT_CAT', {
          name: 'Cập nhật'
        });
      },
      (err) => err.message.includes('Không tìm thấy danh mục')
    );
  });
});
