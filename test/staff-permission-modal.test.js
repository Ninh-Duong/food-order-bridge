const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Staff Permission Modal DOM Structure & Lifecycle Tests', async (t) => {
  const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin.html');
  const staffManagerPath = path.join(__dirname, '..', 'public', 'js', 'admin', 'staff-permissions-manager.js');

  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const staffManagerJs = fs.readFileSync(staffManagerPath, 'utf8');

  await t.test('admin.html: #invoice-preview-overlay phải được đóng hoàn chỉnh trước khi khai báo #staff-permission-modal', () => {
    const invoiceIndex = adminHtml.indexOf('id="invoice-preview-overlay"');
    const staffModalIndex = adminHtml.indexOf('id="staff-permission-modal"');

    assert.ok(invoiceIndex > 0, '#invoice-preview-overlay must exist in admin.html');
    assert.ok(staffModalIndex > 0, '#staff-permission-modal must exist in admin.html');
    assert.ok(invoiceIndex < staffModalIndex, '#invoice-preview-overlay must precede #staff-permission-modal');

    // Extract HTML segment between invoice-preview-overlay and staff-permission-modal
    const intermediateHtml = adminHtml.slice(invoiceIndex, staffModalIndex);
    
    // Check that </section> is followed by closing </div> before staff modal starts
    assert.ok(
      intermediateHtml.includes('</section>\n  </div>') || intermediateHtml.includes('</section>\r\n  </div>') || intermediateHtml.includes('</section></div>') || intermediateHtml.includes('</section>\n</div>'),
      'invoice-preview-overlay must have a closing </div> before staff-permission-modal'
    );
  });

  await t.test('staff-permissions-manager.js: openPermissionModal thiết lập hidden=false, display=flex và aria-hidden=false', () => {
    assert.ok(staffManagerJs.includes("modal.hidden = false"), 'openPermissionModal must unhide modal');
    assert.ok(staffManagerJs.includes("modal.style.display = 'flex'"), 'openPermissionModal must set display to flex');
    assert.ok(staffManagerJs.includes("modal.setAttribute('aria-hidden', 'false')"), 'openPermissionModal must update aria-hidden to false');
  });

  await t.test('staff-permissions-manager.js: closePermissionModal thiết lập hidden=true, display=none và aria-hidden=true', () => {
    assert.ok(staffManagerJs.includes("modal.hidden = true"), 'closePermissionModal must hide modal');
    assert.ok(staffManagerJs.includes("modal.style.display = 'none'"), 'closePermissionModal must set display to none');
    assert.ok(staffManagerJs.includes("modal.setAttribute('aria-hidden', 'true')"), 'closePermissionModal must update aria-hidden to true');
  });

  await t.test('staff-permissions-manager.js: Hỗ trợ đóng modal khi bấm phím Escape', () => {
    assert.ok(staffManagerJs.includes("e.key === 'Escape'"), 'Must handle Escape keydown event');
    assert.ok(staffManagerJs.includes("closePermissionModal()"), 'Escape keydown must call closePermissionModal');
  });

  await t.test('staff-permissions-manager.js: Lưu quyền gọi đúng API PUT /api/auth/staff/:id/permissions', () => {
    assert.ok(
      staffManagerJs.includes("API.put(`/api/auth/staff/${currentEditingStaff.id}/permissions`"),
      'Must call PUT /api/auth/staff/:id/permissions on save'
    );
    assert.ok(staffManagerJs.includes('permissionMode: mode'), 'Payload must include permissionMode');
    assert.ok(staffManagerJs.includes('permissions: permissionsArray'), 'Payload must include permissions array');
  });
});
