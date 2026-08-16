const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Admin Page & Bootstrap Resiliency Tests', async (t) => {
  const authJsPath = path.join(__dirname, '..', 'public', 'js', 'admin', 'auth.js');
  const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin.html');

  const authJs = fs.readFileSync(authJsPath, 'utf8');
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

  await t.test('auth.js có timeout và hiển thị nút Thử lại (retry) khi timeout/lỗi', () => {
    assert.ok(authJs.includes('fetchWithTimeout'));
    assert.ok(authJs.includes('btn-retry-bootstrap'));
    assert.ok(authJs.includes('Quá thời gian tải dữ liệu quản trị từ máy chủ. Vui lòng thử lại.'));
  });

  await t.test('auth.js chỉ redirect khi nhận đúng mã lỗi 401 hoặc 403', () => {
    assert.ok(authJs.includes('if (error.status === 401 || error.status === 403)'));
    assert.ok(authJs.includes("window.location.replace(`/login.html?returnUrl="));
  });

  await t.test('admin.html khởi tạo các module độc lập không làm treo trang khi một module lỗi', () => {
    assert.ok(adminHtml.includes('initOrderMonitor();'));
    assert.ok(adminHtml.includes('initCategoryManager(workspace);'));
    assert.ok(adminHtml.includes('initItemManager(workspace);'));
    assert.ok(adminHtml.includes('initStaffPermissionsManager(workspace).catch('));
  });
});
