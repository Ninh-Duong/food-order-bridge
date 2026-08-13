const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loginSuperAdmin,
  issueSuperAdminToken,
  parseSuperAdminToken
} = require('../src/services/super-admin-service');

test('Super Admin Auth Realm Unit Tests', async (t) => {
  await t.test('loginSuperAdmin: Đăng nhập thành công với thông tin Super Admin đúng', async () => {
    const result = await loginSuperAdmin('0900000000', 'SuperAdmin123!');
    assert.ok(result);
    assert.equal(result.superAdmin.role, 'SUPER_ADMIN');
    assert.ok(result.token);
  });

  await t.test('loginSuperAdmin: Từ chối đăng nhập khi sai mật khẩu', async () => {
    const result = await loginSuperAdmin('0900000000', 'WrongPassword');
    assert.equal(result, null);
  });

  await t.test('parseSuperAdminToken: Giải mã token Super Admin hợp lệ', () => {
    const token = issueSuperAdminToken('+84900000000');
    const parsed = parseSuperAdminToken(token);
    assert.ok(parsed);
    assert.equal(parsed.role, 'SUPER_ADMIN');
    assert.equal(parsed.phone, '+84900000000');
  });

  await t.test('parseSuperAdminToken: Từ chối token bị sửa đổi chữ ký (tampered token)', () => {
    const token = issueSuperAdminToken('+84900000000');
    const tampered = token.slice(0, -5) + 'fake1';
    const parsed = parseSuperAdminToken(tampered);
    assert.equal(parsed, null);
  });
});
