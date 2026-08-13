const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LEGACY_STORE_ID,
  LEGACY_BRANCH_ID,
  dryRunMigration,
  executeMigration
} = require('../src/services/tenant-migration-service');

test('Legacy Data Migration Service Tests', async (t) => {
  await t.test('dryRunMigration: Trả về kết quả thống kê các bản ghi chưa phân vùng', async () => {
    const report = await dryRunMigration();
    assert.equal(report.targetStoreId, LEGACY_STORE_ID);
    assert.equal(report.targetBranchId, LEGACY_BRANCH_ID);
    assert.ok(typeof report.totalUnmigrated === 'number');
    assert.ok(report.unmigratedCounts.categories >= 0);
    assert.ok(report.unmigratedCounts.menuItems >= 0);
  });

  await t.test('executeMigration: Khởi tạo Legacy Store & Branch và không có lỗi', async () => {
    const report = await executeMigration();
    assert.equal(report.errors.length, 0);
    assert.ok(typeof report.categoriesUpdated === 'number');
    assert.ok(typeof report.menuItemsUpdated === 'number');
    assert.ok(typeof report.ordersUpdated === 'number');
  });
});
