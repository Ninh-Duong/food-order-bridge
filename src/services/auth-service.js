const crypto = require('crypto');
const userRepository = require('../repositories/user-repository');

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

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
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET phải được cấu hình với ít nhất 32 ký tự');
  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function issueToken(user) {
  const payload = encode({ sub: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
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
  return { user: { id: String(user._id || user.id), username: user.username, role: user.role }, token: issueToken({ id: String(user._id || user.id), username: user.username, role: user.role }) };
}

async function createStaff(rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  validateCredentials(username, password);
  if (await userRepository.findByUsername(username)) throw new Error('Tên đăng nhập đã tồn tại');
  return userRepository.create({ id: crypto.randomUUID(), username, passwordHash: hashPassword(password), role: 'staff', active: true });
}

module.exports = { TOKEN_TTL_SECONDS, bootstrapAdmin, login, createStaff, parseToken, issueToken, listStaff: userRepository.listStaff };
