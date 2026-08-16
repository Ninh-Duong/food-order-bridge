const crypto = require('crypto');
const { StoreModel, BranchModel, UserModel, AuditLogModel, MenuItemModel, BranchInventoryModel } = require('../models');
const { normalizeVNPhone, formatPhoneDisplay } = require('../utils/phone-normalizer');
const { isDBConnected } = require('../db');

const TOKEN_TTL = 4 * 60 * 60; // 4 hours

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

function getSuperAdminConfig() {
  const production = process.env.NODE_ENV === 'production';
  const phoneValue = process.env.SUPER_ADMIN_PHONE || (production ? '' : '0900000000');
  const passwordHash = process.env.SUPER_ADMIN_PASSWORD_HASH
    || (production ? '' : hashPassword(process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!'));
  const secret = process.env.SUPER_ADMIN_AUTH_SECRET
    || (production ? '' : 'local-super-admin-secret-change-me-32chars');

  if (production && (!phoneValue || !passwordHash || secret.length < 32)) {
    throw new Error('Production requires SUPER_ADMIN_PHONE, SUPER_ADMIN_PASSWORD_HASH and SUPER_ADMIN_AUTH_SECRET (>=32 chars)');
  }

  return { phone: normalizeVNPhone(phoneValue), passwordHash, secret };
}

function issueSuperAdminToken(superAdminPhone) {
  const config = getSuperAdminConfig();
  const payload = Buffer.from(JSON.stringify({
    sub: 'super_admin',
    phone: superAdminPhone,
    role: 'SUPER_ADMIN',
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL
  })).toString('base64url');

  const signature = crypto.createHmac('sha256', config.secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function parseSuperAdminToken(token) {
  try {
    const config = getSuperAdminConfig();
    const [payload, signature] = String(token || '').split('.');
    const expected = crypto.createHmac('sha256', config.secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');

    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.role !== 'SUPER_ADMIN' || decoded.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch (_) {
    return null;
  }
}

function requireSuperAdmin(req, res, next) {
  const token = req.cookies?.super_admin_session || req.headers['x-super-admin-token'];
  const decoded = parseSuperAdminToken(token);

  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Không có quyền truy cập Super Admin' });
  }

  req.superAdmin = decoded;
  next();
}

async function loginSuperAdmin(phoneInput, password) {
  const normalized = normalizeVNPhone(phoneInput);
  const config = getSuperAdminConfig();

  if (normalized !== config.phone || !verifyPassword(password, config.passwordHash)) {
    return null;
  }

  const token = issueSuperAdminToken(normalized);
  return {
    superAdmin: { phone: normalized, role: 'SUPER_ADMIN' },
    token
  };
}

async function logAuditAction(actorId, actorRole, action, target, details, storeId = null, branchId = null) {
  try {
    if (isDBConnected()) {
      await AuditLogModel.create({
        id: crypto.randomUUID(),
        actorId,
        actorRole,
        storeId,
        branchId,
        action,
        target,
        details,
        timestamp: new Date()
      });
    }
  } catch (err) {
    console.error('Lỗi khi ghi audit log:', err.message);
  }
}

// --- Super Admin CRUD Operations ---

async function listStores() {
  if (isDBConnected()) {
    const stores = await StoreModel.find().sort({ createdAt: -1 }).lean();
    return Promise.all(stores.map(async (store) => ({
      ...store,
      branches: await BranchModel.find({ storeId: store.id }).sort({ createdAt: 1 }).lean()
    })));
  }
  return [{ id: 'legacy-store', code: 'LEGACY', name: 'Cửa hàng Mặc định', status: 'ACTIVE', branches: [{ id: 'legacy-main-branch', code: 'MAIN', name: 'Chi nhánh Chính', status: 'ACTIVE' }] }];
}

async function createStore(data) {
  const { code, name, slug, phone, email, plan, maxBranches, ownerPhone, ownerPassword } = data;

  if (!code || !name || !slug) throw new Error('Code, Tên cửa hàng và Slug là bắt buộc');

  const storeId = `st_${crypto.randomBytes(4).toString('hex')}`;
  const normalizedPhone = ownerPhone ? normalizeVNPhone(ownerPhone) : null;

  let ownerId = null;
  if (normalizedPhone && ownerPassword) {
    ownerId = `usr_${crypto.randomBytes(4).toString('hex')}`;
    if (isDBConnected()) {
      const existingUser = await UserModel.findOne({
        $or: [
          { phoneNormalized: normalizedPhone },
          { username: normalizedPhone }
        ]
      }).lean();
      if (existingUser) {
        throw new Error(`Số điện thoại ${ownerPhone} đã được đăng ký cho tài khoản khác.`);
      }

      await UserModel.create({
        id: ownerId,
        storeId,
        username: normalizedPhone,
        phoneNormalized: normalizedPhone,
        phoneDisplay: formatPhoneDisplay(normalizedPhone),
        passwordHash: hashPassword(ownerPassword),
        role: 'STORE_OWNER',
        branchIds: [],
        active: true
      });
    }
  }

  let store = null;
  if (isDBConnected()) {
    store = await StoreModel.create({
      id: storeId,
      code: code.toUpperCase(),
      name,
      slug: slug.toLowerCase(),
      phone: normalizedPhone || phone || '',
      email: email || '',
      status: 'ACTIVE',
      primaryOwnerId: ownerId,
      plan: plan || 'FREE',
      maxBranches: maxBranches || 5
    });

    // Tạo chi nhánh chính mặc định
    const branchId = `br_${crypto.randomBytes(4).toString('hex')}`;
    await BranchModel.create({
      id: branchId,
      storeId,
      code: 'MAIN',
      name: 'Chi nhánh 1 (Chính)',
      slug: 'chi-nhanh-1',
      timezone: 'Asia/Ho_Chi_Minh',
      status: 'ACTIVE'
    });

    if (ownerId) {
      await UserModel.updateOne({ id: ownerId }, { $push: { branchIds: branchId } });
    }
  } else {
    store = { id: storeId, code, name, slug, status: 'ACTIVE' };
  }

  await logAuditAction('super_admin', 'SUPER_ADMIN', 'CREATE_STORE', storeId, { name, code });
  return store;
}

async function updateStoreStatus(storeId, status) {
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw new Error('Trạng thái cửa hàng không hợp lệ');

  if (isDBConnected()) {
    await StoreModel.updateOne({ id: storeId }, { $set: { status, updatedAt: new Date() } });
  }

  await logAuditAction('super_admin', 'SUPER_ADMIN', 'UPDATE_STORE_STATUS', storeId, { status });
  return { storeId, status };
}

async function createBranch(storeId, branchData) {
  const { code, name, slug, address, phone } = branchData;
  if (!code || !name) throw new Error('Mã và Tên chi nhánh là bắt buộc');

  if (isDBConnected()) {
    const store = await StoreModel.findOne({ id: storeId });
    if (!store) throw new Error('Cửa hàng không tồn tại');
    if (store.status !== 'ACTIVE') throw new Error('Không thể thêm chi nhánh cho cửa hàng đang bị khóa');

    const currentBranchCount = await BranchModel.countDocuments({ storeId });
    if (currentBranchCount >= store.maxBranches) {
      throw new Error(`Cửa hàng đã đạt giới hạn tối đa ${store.maxBranches} chi nhánh`);
    }

    const branchId = `br_${crypto.randomBytes(4).toString('hex')}`;
    const branch = await BranchModel.create({
      id: branchId,
      storeId,
      code: code.toUpperCase(),
      name,
      slug: (slug || name).toLowerCase().replace(/[\s\/]+/g, '-'),
      address: address || '',
      phone: phone || store.phone || '',
      status: 'ACTIVE'
    });

    const catalogItems = await MenuItemModel.find({ storeId }).select({ id: 1, stockQuantity: 1, active: 1 }).lean();
    if (catalogItems.length > 0) {
      await BranchInventoryModel.insertMany(catalogItems.map((item) => ({
        storeId,
        branchId,
        menuItemId: item.id,
        stockQuantity: item.stockQuantity || 0,
        active: item.active !== false
      })), { ordered: false });
    }

    await logAuditAction('super_admin', 'SUPER_ADMIN', 'CREATE_BRANCH', branchId, { name, code }, storeId, branchId);
    return branch;
  }

  return { id: 'br_mock', storeId, code, name, status: 'ACTIVE' };
}

async function updateBranchStatus(branchId, status) {
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new Error('Trạng thái chi nhánh không hợp lệ');

  if (isDBConnected()) {
    await BranchModel.updateOne({ id: branchId }, { $set: { status, updatedAt: new Date() } });
  }

  await logAuditAction('super_admin', 'SUPER_ADMIN', 'UPDATE_BRANCH_STATUS', branchId, { status });
  return { branchId, status };
}

module.exports = {
  getSuperAdminConfig,
  issueSuperAdminToken,
  parseSuperAdminToken,
  requireSuperAdmin,
  loginSuperAdmin,
  listStores,
  createStore,
  updateStoreStatus,
  createBranch,
  updateBranchStatus,
  logAuditAction
};
