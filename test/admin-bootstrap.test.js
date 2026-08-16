const test = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/auth-service');
const { StoreModel, BranchModel } = require('../src/models');

test('Admin Bootstrap & Workspace Session Tests', async (t) => {
  const originalSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars-long';

  const mockStore = {
    id: 'store-demo',
    code: 'DEMO01',
    name: 'Demo Restaurant',
    slug: 'demo-restaurant',
    status: 'ACTIVE'
  };

  const mockBranches = [
    { id: 'branch-1', storeId: 'store-demo', name: 'Chi nhánh 1', code: 'CN01', status: 'ACTIVE' },
    { id: 'branch-2', storeId: 'store-demo', name: 'Chi nhánh 2', code: 'CN02', status: 'ACTIVE' }
  ];

  const originalFindStore = StoreModel.findOne;
  const originalFindBranch = BranchModel.find;

  StoreModel.findOne = (query) => ({
    lean: async () => (query.id === mockStore.id ? mockStore : null)
  });

  BranchModel.find = (query) => ({
    lean: async () => (query.storeId === mockStore.id ? mockBranches : [])
  });

  t.after(() => {
    StoreModel.findOne = originalFindStore;
    BranchModel.find = originalFindBranch;
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  await t.test('getBootstrap thành công với session hợp lệ và trả về đầy đủ store & activeBranch', async () => {
    const userSession = {
      id: 'usr-1',
      username: 'admin_user',
      role: 'STORE_OWNER',
      storeId: 'store-demo',
      branchId: 'branch-1',
      branchIds: ['branch-1', 'branch-2'],
      permissions: ['orders.read', 'orders.write', 'catalog.read', 'catalog.write']
    };

    const bootstrap = await authService.getBootstrap(userSession);
    assert.ok(bootstrap);
    assert.equal(bootstrap.user.id, 'usr-1');
    assert.equal(bootstrap.store.id, 'store-demo');
    assert.equal(bootstrap.activeBranch.id, 'branch-1');
    assert.equal(bootstrap.branches.length, 2);
    assert.ok(Array.isArray(bootstrap.permissions));
  });

  await t.test('getBootstrap từ chối nếu thiếu storeId trong session', async () => {
    await assert.rejects(
      async () => {
        await authService.getBootstrap({ id: 'usr-no-store' });
      },
      (err) => {
        assert.ok(err.message.includes('thiếu store context'));
        return true;
      }
    );
  });
});
