const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const { UserModel } = require('../models');

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
  const value = user.toObject ? user.toObject() : user;
  return { id: String(value._id || value.id), username: value.username, role: value.role, active: value.active, createdAt: value.createdAt };
}

async function findByUsername(username) {
  if (isDBConnected()) return UserModel.findOne({ username }).lean();
  return readFileUsers().find((user) => user.username === username) || null;
}

async function findAdmin() {
  if (isDBConnected()) return UserModel.findOne({ role: 'admin' }).lean();
  return readFileUsers().find((user) => user.role === 'admin') || null;
}

async function create(user) {
  if (isDBConnected()) return safeUser(await UserModel.create(user));
  const users = readFileUsers();
  const stored = { id: user.id, ...user, createdAt: new Date().toISOString() };
  users.push(stored);
  writeFileUsers(users);
  return safeUser(stored);
}

async function listStaff() {
  const users = isDBConnected()
    ? await UserModel.find({ role: 'staff' }).sort({ createdAt: -1 }).lean()
    : readFileUsers().filter((user) => user.role === 'staff');
  return users.map(safeUser);
}

module.exports = { findByUsername, findAdmin, create, listStaff };
