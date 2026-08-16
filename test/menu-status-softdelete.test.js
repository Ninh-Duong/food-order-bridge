const test = require('node:test');
const assert = require('node:assert/strict');
const menuService = require('../src/services/menu-service');
const categoryRepository = require('../src/repositories/category-repository');
const orderService = require('../src/services/order-service');

async function ensureCategory(tenantContext, catId = 'CAT_MAIN', catName = 'Món chính') {
  try {
    let cat = await categoryRepository.getByIdForTenant(tenantContext, catId);
    if (!cat) {
      cat = await categoryRepository.create({ id: catId, name: catName, slug: catId.toLowerCase(), active: true }, tenantContext);
    }
    return cat;
  } catch (err) {
    return { id: catId, name: catName };
  }
}

test('Menu Service: toggleItemActive and softDelete / restore flow', async () => {
  const tenantContext = { storeId: 'test-menu-store', branchId: 'branch-1' };
  await ensureCategory(tenantContext, 'CAT_TEST_1', 'Món chính');
  const itemId = `TEST_ITEM_${Date.now()}`;

  // Save new item
  const created = await menuService.saveMenuItem({
    id: itemId,
    name: 'Món Thử Nghiệm',
    price: 45000,
    categoryId: 'CAT_TEST_1',
    stockQuantity: 10
  }, tenantContext);

  assert.equal(created.id, itemId);
  assert.equal(created.active, true);
  assert.equal(created.deletedAt, null);

  // Toggle active to false (locked/suspended)
  const locked = await menuService.toggleItemActive(itemId, false, tenantContext, { sub: 'admin' });
  assert.equal(locked.active, false);

  // Soft delete item
  const deleted = await menuService.softDeleteMenuItem(itemId, tenantContext, { sub: 'admin' });
  assert.ok(deleted.deletedAt !== null);

  // Default menu list should omit deleted item
  const menuList = await menuService.getMenuForTenant(tenantContext);
  assert.equal(menuList.some(i => i.id === itemId), false);

  // Menu list with includeDeleted should include item
  const menuListWithDeleted = await menuService.getMenuForTenant(tenantContext, { includeDeleted: true });
  assert.equal(menuListWithDeleted.some(i => i.id === itemId), true);

  // Restore item
  const restored = await menuService.restoreMenuItem(itemId, tenantContext, { sub: 'admin' });
  assert.equal(restored.deletedAt, null);

  const restoredMenuList = await menuService.getMenuForTenant(tenantContext);
  assert.equal(restoredMenuList.some(i => i.id === itemId), true);
});

test('Order Service: blocks locked (active=false) and soft-deleted items from being ordered', async () => {
  const tenantContext = { storeId: 'test-order-block-store', branchId: 'branch-1' };
  await ensureCategory(tenantContext, 'CAT_TEST_2', 'Món chính');
  const itemId = `BLOCK_ITEM_${Date.now()}`;

  await menuService.saveMenuItem({
    id: itemId,
    name: 'Món Khóa Bán',
    price: 30000,
    categoryId: 'CAT_TEST_2',
    stockQuantity: 10
  }, tenantContext);

  // 1. Lock item (active = false)
  await menuService.toggleItemActive(itemId, false, tenantContext);

  // Order payload containing locked item
  const payloadLocked = {
    requestId: `req-lock-${Date.now()}`,
    fulfillmentType: 'DINE_IN',
    paymentMethod: 'CASH',
    customer: { name: 'Test Customer', phone: '0987654321' },
    items: [{ productId: itemId, quantity: 1 }]
  };

  await assert.rejects(
    async () => {
      await orderService.processOrder(payloadLocked, tenantContext);
    },
    (err) => {
      assert.equal(err.status, 422);
      assert.match(err.message, /tạm ngưng bán/);
      return true;
    }
  );

  // 2. Soft delete item
  await menuService.toggleItemActive(itemId, true, tenantContext);
  await menuService.softDeleteMenuItem(itemId, tenantContext, { sub: 'admin' });

  const payloadDeleted = {
    requestId: `req-del-${Date.now()}`,
    fulfillmentType: 'DINE_IN',
    paymentMethod: 'CASH',
    customer: { name: 'Test Customer', phone: '0987654321' },
    items: [{ productId: itemId, quantity: 1 }]
  };

  await assert.rejects(
    async () => {
      await orderService.processOrder(payloadDeleted, tenantContext);
    },
    (err) => {
      assert.equal(err.status, 422);
      assert.match(err.message, /không tồn tại/);
      return true;
    }
  );
});

test('Menu Service: updateInventory updates branch inventory stock', async () => {
  const tenantContext = { storeId: 'test-inv-store', branchId: 'branch-1' };
  await ensureCategory(tenantContext, 'CAT_TEST_3', 'Món chính');
  const itemId = `INV_ITEM_${Date.now()}`;

  await menuService.saveMenuItem({
    id: itemId,
    name: 'Món Kho',
    price: 25000,
    categoryId: 'CAT_TEST_3',
    stockQuantity: 5
  }, tenantContext);

  const updated = await menuService.updateInventory(itemId, 50, tenantContext, { sub: 'admin' });
  assert.equal(updated.stockQuantity, 50);

  const fetched = await menuService.getMenuItem(itemId);
  assert.equal(fetched.stockQuantity, 50);
});
