const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { isDBConnected } = require('../db');
const { UserModel } = require('../models');
const { assertTenantContext } = require('../middleware/tenant-context');
const { getEffectivePermissions } = require('../auth/permissions');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function readFileUsers() {
  try {
    return fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : [];
  } catch (err) {
    console.error('Error loading users.json:', err.message);
    return [];
  }
}

function writeFileUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function safeUser(user) {
  if (!user) return null;
  const value = user.toObject ? user.toObject() : user;
  const effectivePermissions = getEffectivePermissions(value);
  return {
    id: String(value._id || value.id),
    username: value.username,
    role: value.role,
    active: value.active !== false,
    storeId: value.storeId || 'legacy-store',
    branchIds: value.branchIds || [],
    permissionMode: value.permissionMode || 'DEFAULT',
    assignedPermissions: value.assignedPermissions || [],
    effectivePermissions,
    permissionUpdatedAt: value.permissionUpdatedAt || null,
    permissionUpdatedBy: value.permissionUpdatedBy || null,
    createdAt: value.createdAt
  };
}

async function findByUsername(username) {
  if (isDBConnected()) return UserModel.findOne({ username }).lean();
  return readFileUsers().find((user) => user.username === username) || null;
}

async function findByPhone(phoneNormalized) {
  if (isDBConnected()) return UserModel.findOne({ phoneNormalized }).lean();
  return readFileUsers().find((user) => user.phoneNormalized === phoneNormalized || user.username === phoneNormalized) || null;
}

async function findAdmin() {
  if (isDBConnected()) return UserModel.findOne({ role: 'admin' }).lean();
  return readFileUsers().find((user) => user.role === 'admin') || null;
}

async function findByIdForTenant(tenantContext, userId) {
  const { storeId } = assertTenantContext(tenantContext);
  if (!userId) return null;

  if (isDBConnected()) {
    const isMongoId = mongoose.Types.ObjectId.isValid(userId);
    const query = {
      storeId,
      $or: [
        ...(isMongoId ? [{ _id: userId }] : []),
        { id: String(userId) }
      ]
    };
    return UserModel.findOne(query).lean();
  }

  const users = readFileUsers();
  return users.find((user) => (user.storeId || 'legacy-store') === storeId && (String(user._id || user.id) === String(userId))) || null;
}

async function create(user) {
  if (isDBConnected()) return safeUser(await UserModel.create(user));
  const users = readFileUsers();
  const stored = { id: user.id, ...user, createdAt: new Date().toISOString() };
  users.push(stored);
  writeFileUsers(users);
  return safeUser(stored);
}

async function listStaff(tenantContext = null) {
  const { storeId } = assertTenantContext(tenantContext);
  const query = { role: { $in: ['staff', 'STAFF'] }, storeId };
  const users = isDBConnected()
    ? await UserModel.find(query).sort({ createdAt: -1 }).lean()
    : readFileUsers().filter((user) => (user.role === 'staff' || user.role === 'STAFF') && (user.storeId || 'legacy-store') === storeId);
  return users.map(safeUser);
}

async function updatePermissions(tenantContext, userId, { permissionMode, assignedPermissions, updatedBy }) {
  const { storeId } = assertTenantContext(tenantContext);
  const updatedAt = new Date();

  if (isDBConnected()) {
    const isMongoId = mongoose.Types.ObjectId.isValid(userId);
    const query = {
      storeId,
      $or: [
        ...(isMongoId ? [{ _id: userId }] : []),
        { id: String(userId) }
      ]
    };
    const updated = await UserModel.findOneAndUpdate(
      query,
      {
        $set: {
          permissionMode,
          assignedPermissions,
          permissionUpdatedAt: updatedAt,
          permissionUpdatedBy: updatedBy,
          updatedAt
        }
      },
      { returnDocument: 'after' }
    ).lean();
    return safeUser(updated);
  }

  const users = readFileUsers();
  const user = users.find((u) => (u.storeId || 'legacy-store') === storeId && (String(u._id || u.id) === String(userId)));
  if (user) {
    user.permissionMode = permissionMode;
    user.assignedPermissions = assignedPermissions;
    user.permissionUpdatedAt = updatedAt.toISOString();
    user.permissionUpdatedBy = updatedBy;
    user.updatedAt = updatedAt.toISOString();
    writeFileUsers(users);
    return safeUser(user);
  }
  return null;
}

async function updateStatus(tenantContext, userId, { active, updatedBy }) {
  const { storeId } = assertTenantContext(tenantContext);
  const updatedAt = new Date();

  if (isDBConnected()) {
    const isMongoId = mongoose.Types.ObjectId.isValid(userId);
    const query = {
      storeId,
      $or: [
        ...(isMongoId ? [{ _id: userId }] : []),
        { id: String(userId) }
      ]
    };
    const updated = await UserModel.findOneAndUpdate(
      query,
      {
        $set: {
          active,
          updatedAt
        }
      },
      { returnDocument: 'after' }
    ).lean();
    return safeUser(updated);
  }

  const users = readFileUsers();
  const user = users.find((u) => (u.storeId || 'legacy-store') === storeId && (String(u._id || u.id) === String(userId)));
  if (user) {
    user.active = active;
    user.updatedAt = updatedAt.toISOString();
    writeFileUsers(users);
    return safeUser(user);
  }
  return null;
}

module.exports = {
  safeUser,
  findByUsername,
  findByPhone,
  findAdmin,
  findByIdForTenant,
  create,
  listStaff,
  updatePermissions,
  updateStatus
};

