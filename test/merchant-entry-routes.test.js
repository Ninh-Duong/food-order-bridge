const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || '0123456789abcdef0123456789abcdef';

const { app } = require('../src/server');
const authService = require('../src/services/auth-service');

describe('Merchant entry and tenant bootstrap routes', () => {
  let server;
  let port;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('redirects unauthenticated root and admin page to merchant login', async () => {
    const root = await fetch(`http://localhost:${port}/`, { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/login.html');

    const admin = await fetch(`http://localhost:${port}/admin.html`, { redirect: 'manual' });
    assert.equal(admin.status, 302);
    assert.match(admin.headers.get('location'), /^\/login\.html\?returnUrl=/);
  });

  it('allows a signed merchant session to open admin workspace', async () => {
    const token = authService.issueToken({
      id: 'merchant-entry-test',
      username: 'owner',
      role: 'STORE_OWNER',
      storeId: 'legacy-store',
      branchId: 'legacy-main-branch'
    });
    const response = await fetch(`http://localhost:${port}/admin.html`, {
      headers: { cookie: `admin_session=${token}` }
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Đang tải cửa hàng/);
  });

  it('returns store-scoped bootstrap data for a signed merchant session', async () => {
    const token = authService.issueToken({
      id: 'merchant-bootstrap-test',
      username: 'owner',
      role: 'STORE_OWNER',
      storeId: 'legacy-store',
      branchId: 'legacy-main-branch'
    });
    const response = await fetch(`http://localhost:${port}/api/auth/bootstrap`, {
      headers: { cookie: `admin_session=${token}` }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.store.id, 'legacy-store');
    assert.ok(Array.isArray(body.branches));
    assert.ok(Array.isArray(body.catalog.categories));
    assert.ok(Array.isArray(body.catalog.menuItems));
  });

  it('keeps staff POS access while denying owner-only catalog and staff-management writes', async () => {
    const token = authService.issueToken({
      id: 'merchant-staff-test',
      username: 'staff',
      role: 'STAFF',
      storeId: 'legacy-store',
      branchId: 'legacy-main-branch'
    });
    const catalogWrite = await fetch(`http://localhost:${port}/api/menu`, {
      method: 'POST',
      headers: { cookie: `admin_session=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'TEST', name: 'Test', price: 1, categoryId: 'CAT' })
    });
    assert.equal(catalogWrite.status, 403);

    const staffManagement = await fetch(`http://localhost:${port}/api/auth/staff`, {
      headers: { cookie: `admin_session=${token}` }
    });
    assert.equal(staffManagement.status, 403);
  });
});
