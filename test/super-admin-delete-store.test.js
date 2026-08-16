const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || '0123456789abcdef0123456789abcdef';

const { app } = require('../src/server');
const { issueSuperAdminToken, deleteStore } = require('../src/services/super-admin-service');
const {
  StoreModel,
  BranchModel,
  BranchInventoryModel,
  UserModel,
  CategoryModel,
  MenuItemModel,
  OrderModel,
  SettingsModel,
  AuditLogModel
} = require('../src/models');

describe('Super Admin Delete Store & Cascade Deletion Tests', () => {
  let server;
  let port;

  before(async () => {
    await new Promise(resolve => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('1. deleteStore service: Xóa vĩnh viễn Store và toàn bộ dữ liệu cascade', async () => {
    const testStoreId = 'st_del_test_01';

    // Mock storage
    const collections = {
      stores: [{ id: testStoreId, name: 'Store to Delete', code: 'STDEL01' }],
      branches: [{ id: 'br_del_1', storeId: testStoreId }],
      inventories: [{ storeId: testStoreId, menuItemId: 'item_1' }],
      users: [{ id: 'usr_del_1', storeId: testStoreId, username: 'owner_del' }],
      categories: [{ id: 'cat_del_1', storeId: testStoreId, name: 'Cat 1' }],
      menuItems: [{ id: 'item_1', storeId: testStoreId, name: 'Item 1' }],
      orders: [{ id: 'ord_1', storeId: testStoreId, totalAmount: 50000 }],
      settings: [{ storeId: testStoreId, shopName: 'Store to Delete' }]
    };

    const origStoreFindOne = StoreModel.findOne;
    const origStoreDeleteOne = StoreModel.deleteOne;
    const origBranchDeleteMany = BranchModel.deleteMany;
    const origInvDeleteMany = BranchInventoryModel.deleteMany;
    const origUserDeleteMany = UserModel.deleteMany;
    const origCatDeleteMany = CategoryModel.deleteMany;
    const origItemDeleteMany = MenuItemModel.deleteMany;
    const origOrderDeleteMany = OrderModel.deleteMany;
    const origSettingsDeleteMany = SettingsModel.deleteMany;

    StoreModel.findOne = (query) => ({
      lean: async () => collections.stores.find(s => s.id === query.id) || null
    });
    StoreModel.deleteOne = async (query) => {
      collections.stores = collections.stores.filter(s => s.id !== query.id);
      return { deletedCount: 1 };
    };
    BranchModel.deleteMany = async (query) => {
      collections.branches = collections.branches.filter(b => b.storeId !== query.storeId);
      return { deletedCount: 1 };
    };
    BranchInventoryModel.deleteMany = async (query) => {
      collections.inventories = collections.inventories.filter(i => i.storeId !== query.storeId);
      return { deletedCount: 1 };
    };
    UserModel.deleteMany = async (query) => {
      collections.users = collections.users.filter(u => u.storeId !== query.storeId);
      return { deletedCount: 1 };
    };
    CategoryModel.deleteMany = async (query) => {
      collections.categories = collections.categories.filter(c => c.storeId !== query.storeId);
      return { deletedCount: 1 };
    };
    MenuItemModel.deleteMany = async (query) => {
      collections.menuItems = collections.menuItems.filter(m => m.storeId !== query.storeId);
      return { deletedCount: 1 };
    };
    OrderModel.deleteMany = async (query) => {
      collections.orders = collections.orders.filter(o => o.storeId !== query.storeId);
      return { deletedCount: 1 };
    };
    SettingsModel.deleteMany = async (query) => {
      collections.settings = collections.settings.filter(s => s.storeId !== query.storeId);
      return { deletedCount: 1 };
    };

    try {
      const result = await deleteStore(testStoreId);
      assert.equal(result.success, true);
      assert.equal(result.storeId, testStoreId);

      assert.equal(collections.stores.length, 0);
      assert.equal(collections.branches.length, 0);
      assert.equal(collections.inventories.length, 0);
      assert.equal(collections.users.length, 0);
      assert.equal(collections.categories.length, 0);
      assert.equal(collections.menuItems.length, 0);
      assert.equal(collections.orders.length, 0);
      assert.equal(collections.settings.length, 0);
    } finally {
      StoreModel.findOne = origStoreFindOne;
      StoreModel.deleteOne = origStoreDeleteOne;
      BranchModel.deleteMany = origBranchDeleteMany;
      BranchInventoryModel.deleteMany = origInvDeleteMany;
      UserModel.deleteMany = origUserDeleteMany;
      CategoryModel.deleteMany = origCatDeleteMany;
      MenuItemModel.deleteMany = origItemDeleteMany;
      OrderModel.deleteMany = origOrderDeleteMany;
      SettingsModel.deleteMany = origSettingsDeleteMany;
    }
  });

  it('2. DELETE /api/super-admin/stores/:id: Từ chối 401 khi không có token Super Admin', async () => {
    const res = await fetch(`http://localhost:${port}/api/super-admin/stores/any_store_id`, {
      method: 'DELETE'
    });
    assert.equal(res.status, 401);
  });

  it('3. DELETE /api/super-admin/stores/:id: Xóa thành công 200 khi có Super Admin token', async () => {
    const token = issueSuperAdminToken('+84900000000');
    const testStoreId = 'st_del_http_02';

    const origStoreFindOne = StoreModel.findOne;
    const origStoreDeleteOne = StoreModel.deleteOne;
    const origBranchDeleteMany = BranchModel.deleteMany;
    const origInvDeleteMany = BranchInventoryModel.deleteMany;
    const origUserDeleteMany = UserModel.deleteMany;
    const origCatDeleteMany = CategoryModel.deleteMany;
    const origItemDeleteMany = MenuItemModel.deleteMany;
    const origOrderDeleteMany = OrderModel.deleteMany;
    const origSettingsDeleteMany = SettingsModel.deleteMany;

    StoreModel.findOne = (query) => ({
      lean: async () => ({ id: query.id, name: 'HTTP Store', code: 'HTTP02' })
    });
    StoreModel.deleteOne = async () => ({ deletedCount: 1 });
    BranchModel.deleteMany = async () => ({ deletedCount: 1 });
    BranchInventoryModel.deleteMany = async () => ({ deletedCount: 1 });
    UserModel.deleteMany = async () => ({ deletedCount: 1 });
    CategoryModel.deleteMany = async () => ({ deletedCount: 1 });
    MenuItemModel.deleteMany = async () => ({ deletedCount: 1 });
    OrderModel.deleteMany = async () => ({ deletedCount: 1 });
    SettingsModel.deleteMany = async () => ({ deletedCount: 1 });

    try {
      const res = await fetch(`http://localhost:${port}/api/super-admin/stores/${testStoreId}`, {
        method: 'DELETE',
        headers: {
          'x-super-admin-token': token
        }
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.storeId, testStoreId);
    } finally {
      StoreModel.findOne = origStoreFindOne;
      StoreModel.deleteOne = origStoreDeleteOne;
      BranchModel.deleteMany = origBranchDeleteMany;
      BranchInventoryModel.deleteMany = origInvDeleteMany;
      UserModel.deleteMany = origUserDeleteMany;
      CategoryModel.deleteMany = origCatDeleteMany;
      MenuItemModel.deleteMany = origItemDeleteMany;
      OrderModel.deleteMany = origOrderDeleteMany;
      SettingsModel.deleteMany = origSettingsDeleteMany;
    }
  });
});
