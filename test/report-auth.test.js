const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, requireAdmin } = require('../src/middleware/auth');

describe('Authorization & Authentication Middleware Tests for Payment & Reports', () => {
  it('requireAuth: Từ chối 401 khi không có admin_session cookie', () => {
    let statusCode = null;
    let jsonResponse = null;

    const req = { headers: {} };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);

    assert.equal(statusCode, 401);
    assert.equal(jsonResponse.message, 'Vui lòng đăng nhập');
    assert.equal(nextCalled, false);
  });

  it('requireAdmin: Từ chối 403 khi tài khoản là staff', () => {
    let statusCode = null;
    let jsonResponse = null;

    const req = { user: { username: 'staff01', role: 'staff' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAdmin(req, res, next);

    assert.equal(statusCode, 403);
    assert.equal(jsonResponse.message, 'Chỉ tài khoản admin được thực hiện thao tác này');
    assert.equal(nextCalled, false);
  });

  it('requireAdmin: Cho phép tiếp tục (next()) khi tài khoản là admin', () => {
    const req = { user: { username: 'admin01', role: 'admin' } };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAdmin(req, res, next);

    assert.equal(nextCalled, true);
  });
});
