const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, permissionsForRole, hasPermission } = require('../src/auth/permissions');

test('Role permissions keep POS access separate from owner-only management', () => {
  const staff = { role: 'STAFF', permissions: permissionsForRole('STAFF') };
  const owner = { role: 'STORE_OWNER', permissions: permissionsForRole('STORE_OWNER') };

  assert.equal(hasPermission(staff, PERMISSIONS.ADMIN_ACCESS), true);
  assert.equal(hasPermission(staff, PERMISSIONS.OWNER_ADMIN), false);
  assert.equal(hasPermission(staff, PERMISSIONS.ORDERS_WRITE), true);
  assert.equal(hasPermission(owner, PERMISSIONS.OWNER_ADMIN), true);
  assert.equal(hasPermission(owner, PERMISSIONS.STAFF_MANAGE), true);
});
