const PERMISSIONS = Object.freeze({
  ADMIN_ACCESS: 'admin.access',
  OWNER_ADMIN: 'owner.admin',
  CATALOG_READ: 'catalog.read',
  CATALOG_WRITE: 'catalog.write',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',
  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',
  REPORTS_READ_BRANCH: 'reports.read.branch',
  REPORTS_READ_STORE: 'reports.read.store',
  STAFF_MANAGE: 'staff.manage',
  SETTINGS_MANAGE: 'settings.manage'
});

const OWNER_PERMISSIONS = Object.freeze([
  PERMISSIONS.ADMIN_ACCESS,
  PERMISSIONS.OWNER_ADMIN,
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_WRITE,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_WRITE,
  PERMISSIONS.ORDERS_READ,
  PERMISSIONS.ORDERS_WRITE,
  PERMISSIONS.REPORTS_READ_BRANCH,
  PERMISSIONS.REPORTS_READ_STORE,
  PERMISSIONS.STAFF_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE
]);

const STAFF_PERMISSIONS = Object.freeze([
  PERMISSIONS.ADMIN_ACCESS,
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_WRITE,
  PERMISSIONS.ORDERS_READ,
  PERMISSIONS.ORDERS_WRITE,
  PERMISSIONS.REPORTS_READ_BRANCH
]);

function permissionsForRole(role) {
  if (role === 'STORE_OWNER' || role === 'admin') return [...OWNER_PERMISSIONS];
  if (role === 'STAFF' || role === 'staff') return [...STAFF_PERMISSIONS];
  return [];
}

function hasPermission(user, permission) {
  if (!user || !permission) return false;
  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : permissionsForRole(user.role);
  return permissions.includes(permission);
}

module.exports = {
  PERMISSIONS,
  permissionsForRole,
  hasPermission
};
