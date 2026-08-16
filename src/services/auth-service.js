const crypto = require('crypto');
const userRepository = require('../repositories/user-repository');
const categoryRepository = require('../repositories/category-repository');
const menuRepository = require('../repositories/menu-repository');
const { normalizeVNPhone, formatPhoneDisplay } = require('../utils/phone-normalizer');
const { StoreModel, BranchModel, UserModel } = require('../models');
const { isDBConnected } = require('../db');
const { permissionsForRole } = require('../auth/permissions');

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const DEVELOPMENT_AUTH_SECRET = 'local-development-auth-secret-change-me-32chars';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validateCredentials(username, password) {
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('Tên đăng nhập phải từ 3-40 ký tự');
  if (String(password || '').length < 8) throw new Error('Mật khẩu phải có ít nhất 8 ký tự');
}

function signingSecret() {
  const secret = process.env.AUTH_SECRET || (
    process.env.NODE_ENV === 'production' ? '' : DEVELOPMENT_AUTH_SECRET
  );
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET phải được cấu hình với ít nhất 32 ký tự');
  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function issueToken(user) {
  const userId = user?.id || user?.sub || user?._id;
  const payload = encode({
    sub: userId ? String(userId) : undefined,
    username: user.username,
    role: user.role,
    storeId: user.storeId || 'legacy-store',
    branchId: user.branchId || 'legacy-main-branch',
    branchIds: user.branchIds || ['legacy-main-branch'],
    permissions: user.permissions || permissionsForRole(user.role),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  });
  const signature = crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function parseToken(token) {
  try {
    const [payload, signature] = String(token || '').split('.');
    const expected = crypto.createHmac('sha256', signingSecret()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return user.exp > Math.floor(Date.now() / 1000) ? user : null;
  } catch (_) {
    return null;
  }
}

async function bootstrapAdmin() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME);
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    return;
  }
  if (await userRepository.findByUsername(username) || await userRepository.findAdmin()) return;
  validateCredentials(username, password);
  try {
    await userRepository.create({
      id: crypto.randomUUID(),
      username,
      passwordHash: hashPassword(password),
      role: 'admin',
      storeId: 'legacy-store',
      branchIds: ['legacy-main-branch'],
      active: true
    });
    console.log(`✅ Đã khởi tạo tài khoản admin: ${username}`);
  } catch (err) {
    if (err.code === 11000 || err.message?.includes('duplicate key')) {
      return;
    }
    throw err;
  }
}

async function login(rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  const user = await userRepository.findByUsername(username);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) return null;
  const userObj = {
    id: String(user._id || user.id),
    username: user.username,
    role: user.role,
    storeId: user.storeId || 'legacy-store',
    branchId: user.branchId || 'legacy-main-branch',
    branchIds: user.branchIds || ['legacy-main-branch'],
    permissions: permissionsForRole(user.role)
  };
  return {
    user: userObj,
    token: issueToken(userObj)
  };
}

async function loginByPhone(phoneInput, password) {
  const loginValue = String(phoneInput || '').trim();
  let normalizedPhone = null;

  // Staff accounts are created with a username, while older merchant accounts
  // can still log in with a Vietnamese mobile number. Try phone normalization
  // only when the input is a phone number so usernames are not rejected by the
  // phone validator before authentication is attempted.
  try {
    normalizedPhone = normalizeVNPhone(loginValue);
  } catch (_) {
    // A non-phone value is handled as a username below.
  }

  const user = (normalizedPhone
    ? await userRepository.findByPhone(normalizedPhone)
    : null)
    || await userRepository.findByUsername(normalizedPhone || normalizeUsername(loginValue));

  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  let branches = [];
  const storeId = user.storeId || 'legacy-store';

  if (isDBConnected()) {
    const store = await StoreModel.findOne({ id: storeId }).lean();
    if (!store || store.status !== 'ACTIVE') return null;
    if (user.role === 'STORE_OWNER' || user.role === 'admin') {
      branches = await BranchModel.find({ storeId, status: 'ACTIVE' }).lean();
    } else {
      branches = await BranchModel.find({ storeId, id: { $in: user.branchIds || [] }, status: 'ACTIVE' }).lean();
    }
  } else {
    branches = [{ id: 'legacy-main-branch', name: 'Chi nhánh Chính', code: 'MAIN' }];
  }

  const preToken = issueToken({
    id: String(user._id || user.id),
    username: user.username || user.phoneNormalized,
    role: user.role,
    storeId,
    branchIds: user.branchIds || ['legacy-main-branch'],
    permissions: permissionsForRole(user.role)
  });

  return {
    user: {
      id: String(user._id || user.id),
      phoneDisplay: user.phoneDisplay || (normalizedPhone ? formatPhoneDisplay(normalizedPhone) : null),
      username: user.username,
      role: user.role,
      storeId,
      permissions: permissionsForRole(user.role)
    },
    branches: branches.map(b => ({ id: b.id, name: b.name, code: b.code })),
    preToken
  };
}

async function selectBranch(userSession, selectedBranchId) {
  if (!userSession || !selectedBranchId) {
    throw new Error('Phiên đăng nhập hoặc chi nhánh được chọn không hợp lệ');
  }

  const { storeId, role, branchIds } = userSession;

  if (isDBConnected()) {
    const [store, branch] = await Promise.all([
      StoreModel.findOne({ id: storeId }).lean(),
      BranchModel.findOne({ id: selectedBranchId, storeId, status: 'ACTIVE' }).lean()
    ]);
    if (!store || store.status !== 'ACTIVE' || !branch) {
      throw new Error('Chi nhánh không tồn tại, đã khóa hoặc không thuộc cửa hàng của bạn');
    }
  } else if (role !== 'STORE_OWNER' && role !== 'admin') {
    if (!Array.isArray(branchIds) || !branchIds.includes(selectedBranchId)) {
      throw new Error('Tài khoản của bạn không có quyền truy cập chi nhánh này');
    }
  } else if (Array.isArray(branchIds) && branchIds.length > 0 && !branchIds.includes(selectedBranchId)) {
    throw new Error('Chi nhánh không thuộc cửa hàng của bạn');
  }

  const updatedUser = {
    ...userSession,
    branchId: selectedBranchId
  };

  return {
    sessionToken: issueToken(updatedUser),
    activeBranchId: selectedBranchId
  };
}

async function getBootstrap(userSession) {
  if (!userSession?.storeId) throw new Error('Phiên đăng nhập thiếu store context');

  const permissions = userSession.permissions || permissionsForRole(userSession.role);
  let store;
  let branches;

  if (isDBConnected()) {
    store = await StoreModel.findOne({ id: userSession.storeId }).lean();
    if (!store || store.status !== 'ACTIVE') {
      const error = new Error('Cửa hàng đã bị khóa hoặc không tồn tại');
      error.status = 403;
      throw error;
    }

    const branchQuery = userSession.role === 'STORE_OWNER' || userSession.role === 'admin'
      ? { storeId: userSession.storeId, status: 'ACTIVE' }
      : { storeId: userSession.storeId, id: { $in: userSession.branchIds || [] }, status: 'ACTIVE' };
    branches = await BranchModel.find(branchQuery).sort({ name: 1 }).lean();
  } else {
    store = {
      id: userSession.storeId,
      name: 'Cửa hàng Mặc định',
      code: 'LEGACY',
      status: 'ACTIVE'
    };
    branches = [{
      id: 'legacy-main-branch',
      storeId: userSession.storeId,
      code: 'MAIN',
      name: 'Chi nhánh Chính',
      status: 'ACTIVE'
    }];
  }

  const activeBranch = branches.find(branch => branch.id === userSession.branchId) || null;
  const tenantContext = { storeId: userSession.storeId, branchId: userSession.branchId || null };
  const [categories, menuItems] = await Promise.all([
    categoryRepository.getAllForTenant(tenantContext),
    menuRepository.getAllForTenant(tenantContext)
  ]);
  const itemCounts = menuItems.reduce((counts, item) => {
    if (item.categoryId) counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
    return counts;
  }, {});
  return {
    user: {
      id: userSession.sub,
      role: userSession.role,
      storeId: userSession.storeId,
      branchId: userSession.branchId || null,
      permissions
    },
    store: {
      id: store.id,
      code: store.code,
      name: store.name,
      status: store.status
    },
    branches: branches.map(branch => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      status: branch.status
    })),
    activeBranch: activeBranch ? {
      id: activeBranch.id,
      code: activeBranch.code,
      name: activeBranch.name
    } : null,
    catalog: {
      categories: categories.map((category) => ({ ...category, itemCount: itemCounts[category.id] || 0 })),
      menuItems
    },
    permissions
  };
}

const auditLogRepository = require('../repositories/audit-log-repository');
const { PERMISSIONS, STAFF_ASSIGNABLE_PERMISSIONS, expandPermissionDependencies } = require('../auth/permissions');

async function createStaff(rawUsername, password, tenantContext = null) {
  const username = normalizeUsername(rawUsername);
  validateCredentials(username, password);
  if (await userRepository.findByUsername(username)) throw new Error('Tên đăng nhập đã tồn tại');
  return userRepository.create({
    id: crypto.randomUUID(),
    username,
    passwordHash: hashPassword(password),
    role: 'staff',
    storeId: tenantContext?.storeId || 'legacy-store',
    branchIds: tenantContext?.branchId ? [tenantContext.branchId] : ['legacy-main-branch'],
    active: true
  });
}

async function listStaff(tenantContext = null) {
  return userRepository.listStaff(tenantContext);
}

function getPermissionCatalog() {
  return [
    {
      groupKey: 'ORDERS',
      groupName: 'Đơn hàng',
      permissions: [
        { key: PERMISSIONS.ORDERS_READ, label: 'Xem đơn hàng', description: 'Xem danh sách & chi tiết đơn hàng', defaultForStaff: true },
        { key: PERMISSIONS.ORDERS_WRITE, label: 'Xử lý đơn hàng', description: 'Chấp nhận, hủy, cập nhật trạng thái đơn', dependencies: [PERMISSIONS.ORDERS_READ], defaultForStaff: true }
      ]
    },
    {
      groupKey: 'MENU',
      groupName: 'Món ăn',
      permissions: [
        { key: PERMISSIONS.CATALOG_READ, label: 'Xem danh sách món', description: 'Xem thực đơn trong admin', defaultForStaff: true },
        { key: PERMISSIONS.CATALOG_WRITE, label: 'Sửa thông tin món', description: 'Tên, giá, mô tả, ảnh, tùy chọn', dependencies: [PERMISSIONS.CATALOG_READ], defaultForStaff: false },
        { key: PERMISSIONS.INVENTORY_READ, label: 'Xem tồn kho', description: 'Xem số lượng tồn kho', defaultForStaff: true },
        { key: PERMISSIONS.INVENTORY_WRITE, label: 'Cập nhật tồn kho', description: 'Thay đổi số lượng tồn kho', dependencies: [PERMISSIONS.INVENTORY_READ], defaultForStaff: true },
        { key: PERMISSIONS.MENU_STATUS_WRITE, label: 'Khóa / mở bán món', description: 'Bật / tắt trạng thái bán hôm nay', dependencies: [PERMISSIONS.CATALOG_READ], defaultForStaff: false },
        { key: PERMISSIONS.CATALOG_DELETE, label: 'Xóa món ăn', description: 'Soft delete & khôi phục món ăn', dependencies: [PERMISSIONS.CATALOG_READ], sensitive: true, defaultForStaff: false }
      ]
    },
    {
      groupKey: 'CATEGORIES',
      groupName: 'Danh mục',
      permissions: [
        { key: PERMISSIONS.CATEGORIES_READ, label: 'Xem danh mục', description: 'Xem danh sách danh mục', defaultForStaff: true },
        { key: PERMISSIONS.CATEGORIES_WRITE, label: 'Thêm / sửa danh mục', description: 'Tạo mới, sửa tên, bật / tắt danh mục', dependencies: [PERMISSIONS.CATEGORIES_READ, PERMISSIONS.CATALOG_READ], defaultForStaff: false }
      ]
    },
    {
      groupKey: 'REPORTS',
      groupName: 'Báo cáo',
      permissions: [
        { key: PERMISSIONS.REPORTS_READ_BRANCH, label: 'Xem báo cáo chi nhánh', description: 'Xem doanh thu chi nhánh được gán', defaultForStaff: true }
      ]
    },
    {
      groupKey: 'STAFF',
      groupName: 'Tài khoản nhân viên',
      permissions: [
        { key: PERMISSIONS.STAFF_MANAGE, label: 'Tạo tài khoản nhân viên', description: 'Tạo tài khoản nhân viên mới', defaultForStaff: false },
        { key: PERMISSIONS.STAFF_RULES_MANAGE, label: 'Phân quyền nhân viên', description: 'Cấu hình quyền cho nhân viên khác', sensitive: true, lockedForStaff: true, defaultForStaff: false }
      ]
    }
  ];
}

async function updateStaffPermissions(tenantContext, staffId, { permissionMode, permissions }, actorUser) {
  if (!tenantContext?.storeId) throw new Error('Thiếu tenant context (storeId)');
  if (!staffId) throw new Error('Thiếu ID nhân viên cần phân quyền');

  const targetUser = await userRepository.findByIdForTenant(tenantContext, staffId);
  if (!targetUser) throw new Error('Không tìm thấy tài khoản nhân viên trong cửa hàng của bạn');

  if (targetUser.role === 'STORE_OWNER' || targetUser.role === 'admin') {
    throw new Error('Không thể tùy chỉnh quyền của tài khoản Admin / Chủ cửa hàng');
  }

  const mode = permissionMode === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT';
  let assignedPermissions = [];

  if (mode === 'CUSTOM') {
    if (!Array.isArray(permissions)) throw new Error('Danh sách quyền phải là một mảng');

    // Check against whitelist guard
    const invalidPerms = permissions.filter(p => !STAFF_ASSIGNABLE_PERMISSIONS.includes(p));
    if (invalidPerms.length > 0) {
      throw new Error(`Các quyền sau không thể cấp cho nhân viên: ${invalidPerms.join(', ')}`);
    }

    assignedPermissions = expandPermissionDependencies(permissions).filter(p => STAFF_ASSIGNABLE_PERMISSIONS.includes(p));
  }

  const updatedUser = await userRepository.updatePermissions(tenantContext, staffId, {
    permissionMode: mode,
    assignedPermissions,
    updatedBy: actorUser?.id || actorUser?.sub || 'system'
  });

  await auditLogRepository.recordLog({
    actorId: actorUser?.id || actorUser?.sub || null,
    actorRole: actorUser?.role || null,
    storeId: tenantContext.storeId,
    branchId: tenantContext.branchId || null,
    action: 'STAFF_PERMISSIONS_UPDATED',
    target: `User:${staffId}`,
    details: {
      targetUsername: targetUser.username,
      permissionMode: mode,
      assignedPermissions
    }
  });

  return updatedUser;
}

async function updateStaffStatus(tenantContext, staffId, { active }, actorUser) {
  if (!tenantContext?.storeId) throw new Error('Thiếu tenant context (storeId)');
  if (!staffId) throw new Error('Thiếu ID nhân viên');

  const targetUser = await userRepository.findByIdForTenant(tenantContext, staffId);
  if (!targetUser) throw new Error('Không tìm thấy tài khoản nhân viên trong cửa hàng của bạn');

  if (targetUser.role === 'STORE_OWNER' || targetUser.role === 'admin') {
    throw new Error('Không thể khóa tài khoản Admin / Chủ cửa hàng');
  }

  const isActive = Boolean(active);
  const updatedUser = await userRepository.updateStatus(tenantContext, staffId, {
    active: isActive,
    updatedBy: actorUser?.id || actorUser?.sub || 'system'
  });

  await auditLogRepository.recordLog({
    actorId: actorUser?.id || actorUser?.sub || null,
    actorRole: actorUser?.role || null,
    storeId: tenantContext.storeId,
    branchId: tenantContext.branchId || null,
    action: isActive ? 'STAFF_ACCOUNT_UNLOCKED' : 'STAFF_ACCOUNT_LOCKED',
    target: `User:${staffId}`,
    details: {
      targetUsername: targetUser.username,
      active: isActive
    }
  });

  return updatedUser;
}

module.exports = {
  TOKEN_TTL_SECONDS,
  bootstrapAdmin,
  login,
  loginByPhone,
  selectBranch,
  getBootstrap,
  createStaff,
  parseToken,
  issueToken,
  listStaff,
  getPermissionCatalog,
  updateStaffPermissions,
  updateStaffStatus
};

