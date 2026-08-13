const test = require('node:test');
const assert = require('node:assert/strict');
const { StoreModel, BranchModel, BranchInventoryModel, AuditLogModel } = require('../src/models');

test('Store & Branch Models Definition Tests', async (t) => {
  await t.test('StoreModel: Khởi tạo schema đúng các trường bắt buộc', () => {
    const store = new StoreModel({
      id: 'st_demo',
      code: 'DEMO',
      name: 'Cửa hàng Demo',
      slug: 'cua-hang-demo'
    });

    assert.equal(store.id, 'st_demo');
    assert.equal(store.code, 'DEMO');
    assert.equal(store.name, 'Cửa hàng Demo');
    assert.equal(store.slug, 'cua-hang-demo');
    assert.equal(store.status, 'ACTIVE');
    assert.equal(store.plan, 'FREE');
    assert.equal(store.maxBranches, 5);
  });

  await t.test('BranchModel: Khởi tạo chi nhánh thuộc storeId', () => {
    const branch = new BranchModel({
      id: 'br_01',
      storeId: 'st_demo',
      code: 'CS01',
      name: 'Chi nhánh 1',
      slug: 'chi-nhanh-1'
    });

    assert.equal(branch.id, 'br_01');
    assert.equal(branch.storeId, 'st_demo');
    assert.equal(branch.code, 'CS01');
    assert.equal(branch.status, 'ACTIVE');
    assert.equal(branch.timezone, 'Asia/Ho_Chi_Minh');
  });

  await t.test('BranchInventoryModel: Khởi tạo tồn kho chi nhánh', () => {
    const inventory = new BranchInventoryModel({
      storeId: 'st_demo',
      branchId: 'br_01',
      menuItemId: 'ITEM01',
      stockQuantity: 50,
      priceOverride: 45000
    });

    assert.equal(inventory.storeId, 'st_demo');
    assert.equal(inventory.branchId, 'br_01');
    assert.equal(inventory.menuItemId, 'ITEM01');
    assert.equal(inventory.stockQuantity, 50);
    assert.equal(inventory.priceOverride, 45000);
    assert.equal(inventory.active, true);
  });

  await t.test('AuditLogModel: Ghi nhận hành động hệ thống', () => {
    const log = new AuditLogModel({
      id: 'log_001',
      actorId: 'usr_owner',
      actorRole: 'STORE_OWNER',
      storeId: 'st_demo',
      action: 'UPDATE_MENU_ITEM',
      target: 'ITEM01',
      details: { oldPrice: 50000, newPrice: 45000 }
    });

    assert.equal(log.id, 'log_001');
    assert.equal(log.action, 'UPDATE_MENU_ITEM');
    assert.equal(log.details.newPrice, 45000);
  });
});
