const test = require('node:test');
const assert = require('node:assert/strict');
const { TenantContextMissingError, assertTenantContext, extractTenantContext } = require('../src/middleware/tenant-context');

test('TenantContextGuard Unit Tests', async (t) => {
  await t.test('assertTenantContext: Trả về context khi có storeId hợp lệ', () => {
    const validCtx = { storeId: 'store_123', branchId: 'branch_456' };
    const result = assertTenantContext(validCtx);
    assert.deepEqual(result, validCtx);
  });

  await t.test('assertTenantContext: Throw TenantContextMissingError khi context rỗng', () => {
    assert.throws(
      () => assertTenantContext(null),
      (err) => err instanceof TenantContextMissingError && err.message.includes('storeId is required')
    );
  });

  await t.test('assertTenantContext: Throw TenantContextMissingError khi context không có storeId', () => {
    assert.throws(
      () => assertTenantContext({ branchId: 'branch_456' }),
      (err) => err instanceof TenantContextMissingError
    );
  });

  await t.test('extractTenantContext: Trích xuất storeId và branchId từ req.user vào req.tenantContext', () => {
    const req = {
      user: { storeId: 'st_01', branchId: 'br_01' }
    };
    const res = {};
    let nextCalled = false;

    extractTenantContext(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.tenantContext, { storeId: 'st_01', branchId: 'br_01' });
  });

  await t.test('extractTenantContext: Fallback về legacy store khi req.user rỗng', () => {
    const req = {};
    const res = {};

    extractTenantContext(req, res, () => {});

    assert.equal(req.tenantContext.storeId, 'legacy-store');
    assert.equal(req.tenantContext.branchId, 'legacy-main-branch');
  });
});
