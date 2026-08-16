const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Admin Navigation & Shell Tests', async (t) => {
  const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin.html');
  const adminShellPath = path.join(__dirname, '..', 'public', 'js', 'admin', 'admin-shell.js');

  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const adminShell = fs.readFileSync(adminShellPath, 'utf8');

  await t.test('admin.html import initAdminTabNavigation từ admin-shell.js', () => {
    assert.ok(adminHtml.includes("import { initAdminTabNavigation } from './js/admin/admin-shell.js';"));
  });

  await t.test('initAdminTabNavigation được gọi ngay khi load script (trước khi bootstrap hoàn thành)', () => {
    assert.ok(adminHtml.includes('initAdminTabNavigation();'));
  });

  await t.test('admin-shell.js cung cấp hàm switchAdminTab và initAdminTabNavigation bằng Event Delegation', () => {
    assert.ok(adminShell.includes('export function switchAdminTab(targetId)'));
    assert.ok(adminShell.includes('export function initAdminTabNavigation()'));
    assert.ok(adminShell.includes("event.target.closest('.admin-tab-btn')"));
  });

  await t.test('Tab mặc định: tab-orders hiển thị, các tab khác mặc định style display none', () => {
    assert.ok(adminHtml.includes('id="tab-orders" class="admin-tab-content">'));
    assert.ok(adminHtml.includes('id="tab-items" class="admin-tab-content" style="display: none;"'));
    assert.ok(adminHtml.includes('id="tab-categories" class="admin-tab-content" style="display: none;"'));
    assert.ok(adminHtml.includes('id="tab-accounts" class="admin-tab-content admin-only" data-permission="staff.manage" style="display: none;"'));
    assert.ok(adminHtml.includes('id="tab-reports" class="admin-tab-content admin-only" data-permission="reports.read.store" style="display: none;"'));
  });
});
