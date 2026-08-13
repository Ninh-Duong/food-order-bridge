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
  const payload = encode({
    sub: user.id,
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
  if (await userRepository.findAdmin()) return;
  const username = normalizeUsername(process.env.ADMIN_USERNAME);
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('⚠️ Chưa có admin. Hãy cấu hình ADMIN_USERNAME và ADMIN_PASSWORD rồi khởi động lại.');
    return;
  }
  validateCredentials(username, password);
  await userRepository.create({ id: crypto.randomUUID(), username, passwordHash: hashPassword(password), role: 'admin', active: true });
  console.log(`✅ Đã khởi tạo tài khoản admin: ${username}`);
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
  const normalizedPhone = normalizeVNPhone(phoneInput);
  const user = await userRepository.findByPhone(normalizedPhone)
    || await userRepository.findByUsername(normalizedPhone);

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
      phoneDisplay: user.phoneDisplay || formatPhoneDisplay(normalizedPhone),
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
  listStaff
};
