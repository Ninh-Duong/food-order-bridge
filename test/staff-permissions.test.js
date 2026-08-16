const test = require('node:test');
const assert = require('node:assert/strict');
const permissionsModule = require('../src/auth/permissions');
const userRepository = require('../src/repositories/user-repository');
const authService = require('../src/services/auth-service');
const { requireAuth } = require('../src/middleware/auth');

test('Permissions helper: expandPermissionDependencies correctly expands dependent permissions', () => {
  const input = ['orders.write', 'catalog.write'];
  const expanded = permissionsModule.expandPermissionDependencies(input);

  assert.ok(expanded.includes('orders.write'));
  assert.ok(expanded.includes('orders.read'));
  assert.ok(expanded.includes('catalog.write'));
  assert.ok(expanded.includes('catalog.read'));
});

test('Permissions helper: getEffectivePermissions returns full permissions for admin/owner and restricted for staff', () => {
  const adminUser = { role: 'STORE_OWNER' };
  const adminPerms = permissionsModule.getEffectivePermissions(adminUser);
  assert.ok(adminPerms.includes('owner.admin'));
  assert.ok(adminPerms.includes('staff.rules.manage'));

  const defaultStaffUser = { role: 'STAFF', permissionMode: 'DEFAULT' };
  const staffPerms = permissionsModule.getEffectivePermissions(defaultStaffUser);
  assert.ok(staffPerms.includes('orders.read'));
  assert.ok(staffPerms.includes('inventory.write'));
  assert.equal(staffPerms.includes('staff.rules.manage'), false);
  assert.equal(staffPerms.includes('catalog.delete'), false);

  const customStaffUser = {
    role: 'STAFF',
    permissionMode: 'CUSTOM',
    assignedPermissions: ['menu.status.write', 'catalog.delete']
  };
  const customPerms = permissionsModule.getEffectivePermissions(customStaffUser);
  assert.ok(customPerms.includes('menu.status.write'));
  assert.ok(customPerms.includes('catalog.delete'));
  assert.ok(customPerms.includes('catalog.read')); // Auto-expanded dependency
  assert.equal(customPerms.includes('staff.rules.manage'), false); // Cannot bypass whitelist
});

test('Auth Service: updateStaffPermissions enforces tenant isolation and whitelist guard', async () => {
  const tenantContextA = { storeId: 'test-store-a', branchId: 'branch-a' };
  const tenantContextB = { storeId: 'test-store-b', branchId: 'branch-b' };

  // Create staff in Store A
  const staffA = await userRepository.create({
    id: `staff-a-${Date.now()}`,
    username: `staff_a_${Date.now()}`,
    passwordHash: 'salt:hash',
    role: 'staff',
    storeId: tenantContextA.storeId,
    active: true
  });

  // Attempt to update staffA from Store B -> Must throw error
  await assert.rejects(
    async () => {
      await authService.updateStaffPermissions(tenantContextB, staffA.id, {
        permissionMode: 'CUSTOM',
        permissions: ['inventory.write']
      }, { sub: 'admin-b', role: 'admin' });
    },
    (err) => {
      assert.match(err.message, /Không tìm thấy tài khoản/);
      return true;
    }
  );

  // Attempt to grant non-assignable permission (staff.rules.manage) -> Must throw error
  await assert.rejects(
    async () => {
      await authService.updateStaffPermissions(tenantContextA, staffA.id, {
        permissionMode: 'CUSTOM',
        permissions: ['staff.rules.manage']
      }, { sub: 'admin-a', role: 'admin' });
    },
    (err) => {
      assert.match(err.message, /Các quyền sau không thể cấp cho nhân viên/);
      return true;
    }
  );

  // Valid custom permissions update for Store A
  const updated = await authService.updateStaffPermissions(tenantContextA, staffA.id, {
    permissionMode: 'CUSTOM',
    permissions: ['menu.status.write', 'inventory.write']
  }, { sub: 'admin-a', role: 'admin' });

  assert.equal(updated.permissionMode, 'CUSTOM');
  assert.ok(updated.effectivePermissions.includes('menu.status.write'));
  assert.ok(updated.effectivePermissions.includes('catalog.read')); // Expanded
});

test('Auth Middleware: dynamic DB lookup invalidates session instantly when user is locked', async () => {
  const tenantContext = { storeId: 'test-store-lock', branchId: 'branch-lock' };
  const staff = await userRepository.create({
    id: `staff-lock-${Date.now()}`,
    username: `staff_lock_${Date.now()}`,
    passwordHash: 'salt:hash',
    role: 'staff',
    storeId: tenantContext.storeId,
    active: true
  });

  const token = authService.issueToken({
    id: staff.id,
    sub: staff.id,
    username: staff.username,
    role: 'staff',
    storeId: tenantContext.storeId
  });

  const mockReq = {
    headers: { cookie: `admin_session=${token}` }
  };
  let nextCalled = false;
  const mockRes = {
    status: (code) => ({
      json: (data) => {
        mockRes.statusCode = code;
        mockRes.data = data;
      }
    })
  };

  // 1. Initial active state -> requireAuth passes
  await requireAuth(mockReq, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(mockReq.user.sub, staff.id);

  // 2. Admin locks staff account in DB
  await authService.updateStaffStatus(tenantContext, staff.id, { active: false }, { sub: 'admin', role: 'admin' });

  // 3. Next request with SAME JWT token -> requireAuth rejects with 401
  nextCalled = false;
  await requireAuth(mockReq, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(mockRes.statusCode, 401);
  assert.match(mockRes.data.message, /bị khóa/);
});
