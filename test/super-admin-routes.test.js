const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || '0123456789abcdef0123456789abcdef';

const { app } = require('../src/server');
const { issueSuperAdminToken } = require('../src/services/super-admin-service');

describe('POST & GET /api/super-admin HTTP Integration Tests', () => {
  let server;
  let port;

  before(async () => {
    await new Promise(resolve => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('POST /api/super-admin/login: Đăng nhập Super Admin thành công', async () => {
    const res = await fetch(`http://localhost:${port}/api/super-admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0900000000', password: 'SuperAdmin123!' })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.token);
  });

  it('GET /api/super-admin/stores: Từ chối 401 khi không gửi token', async () => {
    const res = await fetch(`http://localhost:${port}/api/super-admin/stores`);
    assert.equal(res.status, 401);
  });

  it('GET /api/super-admin/stores: Cho phép truy cập khi gửi Super Admin token', async () => {
    const token = issueSuperAdminToken('+84900000000');
    const res = await fetch(`http://localhost:${port}/api/super-admin/stores`, {
      headers: { 'x-super-admin-token': token }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.stores));
  });
});
