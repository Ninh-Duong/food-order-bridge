const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

it('Super Admin Telegram page có đủ scope Store/Branch, cảnh báo, report và quyền nhiều user', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'super-admin', 'telegram.html'), 'utf8');
  for (const marker of [
    '/api/super-admin/stores/',
    'pendingOrderLimit',
    'pendingTimeoutMinutes',
    'scheduledReportEnabled',
    'dailyReportTime',
    'weeklyReportTime',
    'monthlyReportTime',
    'viewerChips',
    'recipientChips',
    'register-webhook',
    'resetBranch'
  ]) assert.ok(html.includes(marker), `missing UI marker: ${marker}`);
});
