const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const authService = require('../src/services/auth-service');
const userRepository = require('../src/repositories/user-repository');
const { StoreModel, BranchModel, UserModel } = require('../src/models');
const { isDBConnected } = require('../src/db');

function hashPassword(password, salt = 'test-salt') {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

test('Multi-Tenant Store-Scoped Staff Creation and Login Tests', async (t) => {
  const originalSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars-long';

  // Mock in-memory store and user storage for isolated repository testing
  const mockStores = [
    { id: 'store-a', code: 'STOREA', slug: 'store-a', name: 'Cửa hàng A', status: 'ACTIVE' },
    { id: 'store-b', code: 'STOREB', slug: 'store-b', name: 'Cửa hàng B', status: 'ACTIVE' }
  ];

  const mockUsers = [];

  const originalFindStore = StoreModel.findOne;
  const originalFindBranch = BranchModel.find;
  const originalFindByUsernameForTenant = userRepository.findByUsernameForTenant;
  const originalFindAllByUsername = userRepository.findAllByUsername;
  const originalFindByUsername = userRepository.findByUsername;
  const originalCreate = userRepository.create;

  StoreModel.findOne = (query) => {
    return {
      lean: async () => {
        if (query.id) return mockStores.find(s => s.id === query.id) || null;
        if (query.$or) {
          for (const clause of query.$or) {
            const match = mockStores.find(s => (clause.code && s.code === clause.code) || (clause.slug && s.slug === clause.slug) || (clause.id && s.id === clause.id));
            if (match) return match;
          }
        }
        return null;
      }
    };
  };

  BranchModel.find = (query) => {
    return {
      lean: async () => [
        { id: `${query.storeId}-main`, storeId: query.storeId, name: 'Chi nhánh Chính', code: 'MAIN', status: 'ACTIVE' }
      ]
    };
  };

  userRepository.findByUsernameForTenant = async (tenantContext, username) => {
    const norm = String(username).toLowerCase().trim();
    return mockUsers.find(u => u.storeId === tenantContext.storeId && u.username === norm) || null;
  };

  userRepository.findAllByUsername = async (username) => {
    const norm = String(username).toLowerCase().trim();
    return mockUsers.filter(u => u.username === norm);
  };

  userRepository.findByUsername = async (username) => {
    const norm = String(username).toLowerCase().trim();
    return mockUsers.find(u => u.username === norm) || null;
  };

  userRepository.create = async (userData) => {
    const stored = { ...userData, id: userData.id || `usr_${mockUsers.length + 1}`, active: true, createdAt: new Date().toISOString() };
    mockUsers.push(stored);
    return stored;
  };

  t.after(() => {
    StoreModel.findOne = originalFindStore;
    BranchModel.find = originalFindBranch;
    userRepository.findByUsernameForTenant = originalFindByUsernameForTenant;
    userRepository.findAllByUsername = originalFindAllByUsername;
    userRepository.findByUsername = originalFindByUsername;
    userRepository.create = originalCreate;
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  await t.test('1. Tạo nhân viên trùng tên ddn ở 2 cửa hàng khác nhau thành công', async () => {
    const staffA = await authService.createStaff('ddn', 'passwordA123', { storeId: 'store-a' });
    assert.equal(staffA.username, 'ddn');
    assert.equal(staffA.storeId, 'store-a');

    const staffB = await authService.createStaff('ddn', 'passwordB123', { storeId: 'store-b' });
    assert.equal(staffB.username, 'ddn');
    assert.equal(staffB.storeId, 'store-b');

    assert.equal(mockUsers.filter(u => u.username === 'ddn').length, 2);
  });

  await t.test('2. Tạo nhân viên trùng tên ddn trong cùng Cửa hàng A bị từ chối', async () => {
    await assert.rejects(
      async () => {
        await authService.createStaff('ddn', 'anotherPass123', { storeId: 'store-a' });
      },
      (err) => err.message.includes('đã tồn tại trong cửa hàng của bạn')
    );
  });

  await t.test('3. Đăng nhập với STOREA/ddn vào đúng Store A', async () => {
    const resA = await authService.loginByPhone('STOREA/ddn', 'passwordA123');
    assert.ok(resA);
    assert.equal(resA.user.username, 'ddn');
    assert.equal(resA.user.storeId, 'store-a');
  });

  await t.test('4. Đăng nhập với STOREB/ddn vào đúng Store B', async () => {
    const resB = await authService.loginByPhone('STOREB/ddn', 'passwordB123');
    assert.ok(resB);
    assert.equal(resB.user.username, 'ddn');
    assert.equal(resB.user.storeId, 'store-b');
  });

  await t.test('5. Đăng nhập với ddn@STOREA và STOREA:ddn hoạt động chính xác', async () => {
    const resAt = await authService.loginByPhone('ddn@STOREA', 'passwordA123');
    assert.ok(resAt);
    assert.equal(resAt.user.storeId, 'store-a');

    const resColon = await authService.loginByPhone('STOREA:ddn', 'passwordA123');
    assert.ok(resColon);
    assert.equal(resColon.user.storeId, 'store-a');
  });

  await t.test('6. Đăng nhập bằng ddn đơn thuần khi có nhiều cửa hàng cùng username ddn báo lỗi hướng dẫn nhập mã quán', async () => {
    await assert.rejects(
      async () => {
        await authService.loginByPhone('ddn', 'passwordA123');
      },
      (err) => err.message.includes('tồn tại ở nhiều cửa hàng') && err.message.includes('MãQuán/ddn')
    );
  });

  await t.test('7. Đăng nhập bằng username duy nhất (single_staff) không bị yêu cầu mã quán', async () => {
    await authService.createStaff('unique_staff', 'uniquePass123', { storeId: 'store-a' });
    const resUnique = await authService.loginByPhone('unique_staff', 'uniquePass123');
    assert.ok(resUnique);
    assert.equal(resUnique.user.username, 'unique_staff');
    assert.equal(resUnique.user.storeId, 'store-a');
  });

  await t.test('8. Đăng nhập với mã cửa hàng không tồn tại báo lỗi rõ ràng', async () => {
    await assert.rejects(
      async () => {
        await authService.loginByPhone('NONEXISTENT/ddn', 'passwordA123');
      },
      (err) => err.message.includes('Không tìm thấy cửa hàng với mã "NONEXISTENT"')
    );
  });
});
