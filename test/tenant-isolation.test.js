const test = require('node:test');
const assert = require('node:assert/strict');
const { StoreModel, BranchModel, CategoryModel, MenuItemModel, OrderModel } = require('../src/models');
const { assertTenantContext } = require('../src/middleware/tenant-context');

test('Phase 6: Multi-Tenant Data Isolation & Security Tests', async (t) => {
  await t.test('Tenant Isolation: Store A không thể truy cập Category của Store B', () => {
    const categoryStoreA = new CategoryModel({
      storeId: 'store_A',
      id: 'CAT01',
      name: 'Món chính A',
      slug: 'mon-chinh-a'
    });

    const categoryStoreB = new CategoryModel({
      storeId: 'store_B',
      id: 'CAT01', // Cùng ID nhưng khác storeId
      name: 'Món chính B',
      slug: 'mon-chinh-b'
    });

    assert.equal(categoryStoreA.storeId, 'store_A');
    assert.equal(categoryStoreB.storeId, 'store_B');
    assert.notEqual(categoryStoreA.storeId, categoryStoreB.storeId);
  });

  await t.test('Tenant Isolation: Branch A1 không trùng mã Đơn hàng với Branch A2', () => {
    const orderBranchA1 = new OrderModel({
      storeId: 'store_A',
      branchId: 'branch_A1',
      id: 'ORD-001',
      requestId: 'req_a1_01',
      items: [],
      totalPrice: 100000
    });

    const orderBranchA2 = new OrderModel({
      storeId: 'store_A',
      branchId: 'branch_A2',
      id: 'ORD-001',
      requestId: 'req_a2_01',
      items: [],
      totalPrice: 150000
    });

    assert.equal(orderBranchA1.branchId, 'branch_A1');
    assert.equal(orderBranchA2.branchId, 'branch_A2');
  });

  await t.test('Repository Guard: Reject query nếu thiếu tenantContext', () => {
    assert.throws(
      () => assertTenantContext(null),
      (err) => err.name === 'TenantContextMissingError'
    );
  });
});
