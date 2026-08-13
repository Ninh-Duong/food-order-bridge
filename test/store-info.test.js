const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const storeRoutes = require('../src/routes/store-routes');
const { extractTenantContext } = require('../src/middleware/tenant-context');

test('Public Store Info API Tests', async (t) => {
  const app = express();
  app.use(extractTenantContext);
  app.use('/api/store', storeRoutes);

  await t.test('GET /api/store/info: Trả về thông tin cửa hàng công khai cho Storefront', async () => {
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/store/info`);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.storeName);
      assert.ok(data.displayName);
      assert.equal(data.status, 'OPEN');
    } finally {
      server.close();
    }
  });
});
