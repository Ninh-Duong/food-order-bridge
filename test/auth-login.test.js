const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const authService = require('../src/services/auth-service');
const userRepository = require('../src/repositories/user-repository');

function hashPassword(password, salt = 'test-salt') {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

test('Merchant login accepts staff username created by admin', async (t) => {
  const originalSecret = process.env.AUTH_SECRET;
  const originalFindByPhone = userRepository.findByPhone;
  const originalFindByUsername = userRepository.findByUsername;

  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars';
  userRepository.findByPhone = async () => {
    throw new Error('findByPhone must not be called for a username');
  };
  userRepository.findByUsername = async (username) => username === 'staff01'
    ? {
        id: 'staff-id',
        username: 'staff01',
        passwordHash: hashPassword('staff-password'),
        role: 'staff',
        storeId: 'store-1',
        branchIds: ['branch-1'],
        active: true
      }
    : null;

  t.after(() => {
    userRepository.findByPhone = originalFindByPhone;
    userRepository.findByUsername = originalFindByUsername;
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  const result = await authService.loginByPhone('staff01', 'staff-password');

  assert.equal(result.user.username, 'staff01');
  assert.equal(result.user.role, 'staff');
  assert.equal(result.branches[0].id, 'legacy-main-branch');
  assert.ok(result.preToken);
});

test('Merchant login keeps accepting Vietnamese mobile numbers', async (t) => {
  const originalSecret = process.env.AUTH_SECRET;
  const originalFindByPhone = userRepository.findByPhone;
  const originalFindByUsername = userRepository.findByUsername;

  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars';
  userRepository.findByPhone = async (phone) => phone === '+84912345678'
    ? {
        id: 'owner-id',
        username: 'owner01',
        phoneNormalized: phone,
        passwordHash: hashPassword('owner-password'),
        role: 'admin',
        storeId: 'store-1',
        active: true
      }
    : null;
  userRepository.findByUsername = async () => null;

  t.after(() => {
    userRepository.findByPhone = originalFindByPhone;
    userRepository.findByUsername = originalFindByUsername;
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  const result = await authService.loginByPhone('0912 345 678', 'owner-password');

  assert.equal(result.user.phoneDisplay, '0912 345 678');
  assert.equal(result.user.username, 'owner01');
});
