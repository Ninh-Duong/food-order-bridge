const test = require('node:test');
const assert = require('node:assert/strict');
const { selectBranch, parseToken } = require('../src/services/auth-service');

test('Multi-Branch Selection & Session Verification Tests', async (t) => {
  await t.test('selectBranch: Cho phép STORE_OWNER chọn bất kỳ chi nhánh hợp lệ nào trong cửa hàng', async () => {
    const ownerSession = {
      sub: 'usr_owner',
      username: '+84912345678',
      role: 'STORE_OWNER',
      storeId: 'st_01',
      branchIds: ['br_01', 'br_02']
    };

    const result = await selectBranch(ownerSession, 'br_02');
    assert.equal(result.activeBranchId, 'br_02');
    assert.ok(result.sessionToken);

    const parsed = parseToken(result.sessionToken);
    assert.equal(parsed.storeId, 'st_01');
    assert.equal(parsed.branchId, 'br_02');
  });

  await t.test('selectBranch: Cho phép STAFF chọn chi nhánh có nằm trong danh sách branchIds được gán', async () => {
    const staffSession = {
      sub: 'usr_staff',
      username: 'staff_1',
      role: 'STAFF',
      storeId: 'st_01',
      branchIds: ['br_01']
    };

    const result = await selectBranch(staffSession, 'br_01');
    assert.equal(result.activeBranchId, 'br_01');
  });

  await t.test('selectBranch: Từ chối STAFF chọn chi nhánh KHÔNG NẰM TRONG danh sách được gán (HTTP 403 / Error)', async () => {
    const staffSession = {
      sub: 'usr_staff',
      username: 'staff_1',
      role: 'STAFF',
      storeId: 'st_01',
      branchIds: ['br_01']
    };

    await assert.rejects(
      async () => await selectBranch(staffSession, 'br_02_unassigned'),
      (err) => err.message.includes('không có quyền truy cập chi nhánh này')
    );
  });
});
