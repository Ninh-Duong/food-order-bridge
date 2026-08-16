const PERMISSIONS = Object.freeze({
  ADMIN_ACCESS: 'admin.access',
  OWNER_ADMIN: 'owner.admin',

  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',

  CATALOG_READ: 'catalog.read',
  CATALOG_WRITE: 'catalog.write',
  CATALOG_DELETE: 'catalog.delete',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',

  MENU_STATUS_WRITE: 'menu.status.write',

  CATEGORIES_READ: 'categories.read',
  CATEGORIES_WRITE: 'categories.write',

  REPORTS_READ_BRANCH: 'reports.read.branch',
  REPORTS_READ_STORE: 'reports.read.store',

  STAFF_MANAGE: 'staff.manage',
  STAFF_RULES_MANAGE: 'staff.rules.manage',

  SETTINGS_MANAGE: 'settings.manage',
  SYSTEM_RESET: 'system.reset'
});

const OWNER_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const STAFF_PERMISSIONS = Object.freeze([
  PERMISSIONS.ADMIN_ACCESS,
  PERMISSIONS.ORDERS_READ,
  PERMISSIONS.ORDERS_WRITE,
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_WRITE,
  PERMISSIONS.REPORTS_READ_BRANCH
]);

// Permissions that CAN be assigned to staff (whitelist)
const STAFF_ASSIGNABLE_PERMISSIONS = Object.freeze([
  PERMISSIONS.ADMIN_ACCESS,
  PERMISSIONS.ORDERS_READ,
  PERMISSIONS.ORDERS_WRITE,
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_WRITE,
  PERMISSIONS.CATALOG_DELETE,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_WRITE,
  PERMISSIONS.MENU_STATUS_WRITE,
  PERMISSIONS.CATEGORIES_READ,
  PERMISSIONS.CATEGORIES_WRITE,
  PERMISSIONS.REPORTS_READ_BRANCH,
  PERMISSIONS.STAFF_MANAGE
]);

// Dependencies mapping: granting key automatically grants values
const PERMISSION_DEPENDENCIES = Object.freeze({
  [PERMISSIONS.ORDERS_WRITE]: [PERMISSIONS.ORDERS_READ],
  [PERMISSIONS.CATALOG_WRITE]: [PERMISSIONS.CATALOG_READ],
  [PERMISSIONS.CATALOG_DELETE]: [PERMISSIONS.CATALOG_READ],
  [PERMISSIONS.MENU_STATUS_WRITE]: [PERMISSIONS.CATALOG_READ],
  [PERMISSIONS.INVENTORY_WRITE]: [PERMISSIONS.INVENTORY_READ],
  [PERMISSIONS.CATEGORIES_WRITE]: [PERMISSIONS.CATEGORIES_READ, PERMISSIONS.CATALOG_READ]
});

function expandPermissionDependencies(permissionList = []) {
  const result = new Set();
  for (const perm of permissionList) {
    if (!perm || typeof perm !== 'string') continue;
    result.add(perm);
    const deps = PERMISSION_DEPENDENCIES[perm];
    if (Array.isArray(deps)) {
      deps.forEach(dep => result.add(dep));
    }
  }
  return Array.from(result);
}

function permissionsForRole(role) {
  if (role === 'STORE_OWNER' || role === 'admin') return [...OWNER_PERMISSIONS];
  if (role === 'STAFF' || role === 'staff') return [...STAFF_PERMISSIONS];
  return [];
}

function getEffectivePermissions(user) {
  if (!user) return [];
  if (user.role === 'STORE_OWNER' || user.role === 'admin') {
    return [...OWNER_PERMISSIONS];
  }

  if (user.permissionMode === 'CUSTOM' && Array.isArray(user.assignedPermissions)) {
    // Sanitize against whitelist
    const validAssigned = user.assignedPermissions.filter(p => STAFF_ASSIGNABLE_PERMISSIONS.includes(p));
    return expandPermissionDependencies(validAssigned);
  }

  return [...STAFF_PERMISSIONS];
}

function hasPermission(user, permission) {
  if (!user || !permission) return false;
  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : getEffectivePermissions(user);
  return permissions.includes(permission);
}

module.exports = {
  PERMISSIONS,
  OWNER_PERMISSIONS,
  STAFF_PERMISSIONS,
  STAFF_ASSIGNABLE_PERMISSIONS,
  PERMISSION_DEPENDENCIES,
  expandPermissionDependencies,
  getEffectivePermissions,
  permissionsForRole,
  hasPermission
};

