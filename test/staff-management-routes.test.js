const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const authService = require('../src/services/auth-service');
const userRepository = require('../src/repositories/user-repository');
const { PERMISSIONS } = require('../src/auth/permissions');

function hashPassword(password, salt = 'test-salt') {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

test('Staff Management & Granular Permissions Routes Test Suite', async (t) => {
  const originalCreate = userRepository.create;
  const originalFindByUsernameForTenant = userRepository.findByUsernameForTenant;
  const originalFindByIdForTenant = userRepository.findByIdForTenant;
  const originalUpdatePermissions = userRepository.updatePermissions;
  const originalUpdateStatus = userRepository.updateStatus;
  const originalListStaff = userRepository.listStaff;

  const mockUsersDB = [
    {
      id: 'staff-a1',
      username: 'nv01',
      passwordHash: hashPassword('password123'),
      role: 'staff',
      storeId: 'store-a',
      branchIds: ['branch-a1'],
      permissionMode: 'DEFAULT',
      assignedPermissions: [],
      active: true
    },
    {
      id: 'staff-b1',
      username: 'nv01',
      passwordHash: hashPassword('password123'),
      role: 'staff',
      storeId: 'store-b',
      branchIds: ['branch-b1'],
      permissionMode: 'DEFAULT',
      assignedPermissions: [],
      active: true
    }
  ];

  userRepository.findByUsernameForTenant = async (tenantContext, username) => {
    return mockUsersDB.find(u => u.storeId === tenantContext?.storeId && u.username === username) || null;
  };

  userRepository.findByIdForTenant = async (tenantContext, id) => {
    return mockUsersDB.find(u => u.storeId === tenantContext?.storeId && u.id === id) || null;
  };

  userRepository.create = async (userData) => {
    mockUsersDB.push({ ...userData });
    return userData;
  };

  userRepository.updatePermissions = async (tenantContext, id, patch) => {
    const idx = mockUsersDB.findIndex(u => u.storeId === tenantContext?.storeId && u.id === id);
    if (idx >= 0) {
      mockUsersDB[idx] = { ...mockUsersDB[idx], ...patch };
      return mockUsersDB[idx];
    }
    return null;
  };

  userRepository.updateStatus = async (tenantContext, id, patch) => {
    const idx = mockUsersDB.findIndex(u => u.storeId === tenantContext?.storeId && u.id === id);
    if (idx >= 0) {
      mockUsersDB[idx] = { ...mockUsersDB[idx], ...patch };
      return mockUsersDB[idx];
    }
    return null;
  };

  userRepository.listStaff = async (tenantContext) => {
    return mockUsersDB.filter(u => u.storeId === tenantContext?.storeId && u.role === 'staff');
  };

  t.after(() => {
    userRepository.create = originalCreate;
    userRepository.findByUsernameForTenant = originalFindByUsernameForTenant;
    userRepository.findByIdForTenant = originalFindByIdForTenant;
    userRepository.updatePermissions = originalUpdatePermissions;
    userRepository.updateStatus = originalUpdateStatus;
    userRepository.listStaff = originalListStaff;
  });

  await t.test('Tạo username mới trong cùng store thành công (201)', async () => {
    const created = await authService.createStaff('nv02', 'password123', { storeId: 'store-a', branchId: 'branch-a1' });
    assert.equal(created.username, 'nv02');
    assert.equal(created.storeId, 'store-a');
    assert.equal(created.active, true);
  });

  await t.test('Tạo username trùng trong cùng store trả 409 STAFF_USERNAME_EXISTS', async () => {
    await assert.rejects(
      async () => {
        await authService.createStaff('nv01', 'password123', { storeId: 'store-a' });
      },
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'STAFF_USERNAME_EXISTS');
        assert.ok(err.message.includes('đã tồn tại'));
        return true;
      }
    );
  });

  await t.test('Staff từ Store A không thể cập nhật quyền Staff Store B (Tenant Isolation)', async () => {
    await assert.rejects(
      async () => {
        // Store A context trying to update staff-b1 (which belongs to store-b)
        await authService.updateStaffPermissions(
          { storeId: 'store-a' },
          'staff-b1',
          { permissionMode: 'CUSTOM', permissions: ['orders.read'] },
          { id: 'owner-a', role: 'STORE_OWNER' }
        );
      },
      (err) => {
        assert.ok(err.message.includes('không thuộc cửa hàng') || err.message.includes('Không tìm thấy'));
        return true;
      }
    );
  });

  await t.test('Cập nhật quyền CUSTOM và whitelist guard chặn cấp staff.rules.manage cho Staff', async () => {
    await assert.rejects(
      async () => {
        await authService.updateStaffPermissions(
          { storeId: 'store-a' },
          'staff-a1',
          { permissionMode: 'CUSTOM', permissions: ['orders.read', 'staff.rules.manage'] },
          { id: 'owner-a', role: 'STORE_OWNER' }
        );
      },
      (err) => {
        assert.ok(err.message.includes('không thể cấp') || err.message.includes('không được phép'));
        return true;
      }
    );
  });

  await t.test('Lưu quyền CUSTOM hợp lệ cho Staff thành công', async () => {
    const updated = await authService.updateStaffPermissions(
      { storeId: 'store-a' },
      'staff-a1',
      { permissionMode: 'CUSTOM', permissions: ['orders.read', 'orders.write'] },
      { id: 'owner-a', role: 'STORE_OWNER' }
    );
    assert.equal(updated.permissionMode, 'CUSTOM');
    assert.ok(updated.assignedPermissions.includes('orders.read'));
    assert.ok(updated.assignedPermissions.includes('orders.write'));
  });

  await t.test('Reset về quyền DEFAULT thành công', async () => {
    const updated = await authService.updateStaffPermissions(
      { storeId: 'store-a' },
      'staff-a1',
      { permissionMode: 'DEFAULT' },
      { id: 'owner-a', role: 'STORE_OWNER' }
    );
    assert.equal(updated.permissionMode, 'DEFAULT');
  });

  await t.test('Khóa và mở khóa tài khoản nhân viên thành công', async () => {
    const locked = await authService.updateStaffStatus(
      { storeId: 'store-a' },
      'staff-a1',
      { active: false },
      { id: 'owner-a', role: 'STORE_OWNER' }
    );
    assert.equal(locked.active, false);

    const unlocked = await authService.updateStaffStatus(
      { storeId: 'store-a' },
      'staff-a1',
      { active: true },
      { id: 'owner-a', role: 'STORE_OWNER' }
    );
    assert.equal(unlocked.active, true);
  });
});
