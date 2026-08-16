const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Staff Management Admin UI Frontend Regression Test Suite', async (t) => {
  const authJsPath = path.join(__dirname, '..', 'public', 'js', 'admin', 'auth.js');
  const staffManagerPath = path.join(__dirname, '..', 'public', 'js', 'admin', 'staff-permissions-manager.js');
  const apiJsPath = path.join(__dirname, '..', 'public', 'js', 'common', 'api.js');
  const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin.html');

  const authJsContent = fs.readFileSync(authJsPath, 'utf8');
  const staffManagerContent = fs.readFileSync(staffManagerPath, 'utf8');
  const apiJsContent = fs.readFileSync(apiJsPath, 'utf8');
  const adminHtmlContent = fs.readFileSync(adminHtmlPath, 'utf8');

  await t.test('auth.js không còn xử lý loadStaff và staff-form submit', () => {
    assert.equal(authJsContent.includes('loadStaff'), false, 'auth.js must not define or call loadStaff');
    assert.equal(authJsContent.includes('#staff-form'), false, 'auth.js must not attach listener to staff-form');
  });

  await t.test('Chỉ staff-permissions-manager.js xử lý submit tạo nhân viên và quản lý danh sách', () => {
    assert.ok(staffManagerContent.includes("document.getElementById('staff-form')"), 'staff-permissions-manager.js must handle staff-form');
    assert.ok(staffManagerContent.includes('dataset.state'), 'staff-permissions-manager.js must manage data-state on staff-message');
    assert.ok(staffManagerContent.includes('bindStaffTableDelegation'), 'staff-permissions-manager.js must use delegation for table actions');
  });

  await t.test('admin.html gọi await initStaffPermissionsManager(workspace)', () => {
    assert.ok(adminHtmlContent.includes('await initStaffPermissionsManager(workspace)'), 'admin.html must await initStaffPermissionsManager');
  });

  await t.test('Nút trong bảng nhân viên và modal có type="button"', () => {
    assert.ok(staffManagerContent.includes('type="button" class="btn btn-secondary btn-sm btn-edit-permissions"'), 'Edit permissions button must have type="button"');
    assert.ok(staffManagerContent.includes('type="button" class="btn'), 'Toggle status button must have type="button"');
    assert.ok(adminHtmlContent.includes('id="btn-close-staff-permission-modal"'), 'Modal close button must have id');
  });

  await t.test('API utility hỗ trợ đầy đủ API.patch và API.delete', () => {
    assert.ok(apiJsContent.includes('async patch(endpoint, payload)'), 'api.js must export async patch');
    assert.ok(apiJsContent.includes('async delete(endpoint)'), 'api.js must export async delete');
  });
});
