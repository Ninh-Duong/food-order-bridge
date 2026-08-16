const express = require('express');
const router = express.Router();
const {
  loginSuperAdmin,
  requireSuperAdmin,
  listStores,
  createStore,
  updateStoreStatus,
  deleteStore,
  createBranch,
  updateBranchStatus,
  logAuditAction
} = require('../services/super-admin-service');
const { AuditLogModel } = require('../models');
const { isDBConnected } = require('../db');
const telegramClient = require('../integrations/telegram-client');
const {
  getEffectiveSettings,
  upsertSettings,
  resetBranchSettings,
  serializeSettings,
  listReportAccess,
  replaceReportAccess
} = require('../services/tenant-telegram-settings-service');
const { StoreModel, BranchModel } = require('../models');

// POST /api/super-admin/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const result = await loginSuperAdmin(phone, password);

    if (!result) {
      return res.status(401).json({ success: false, error: 'Số điện thoại hoặc mật khẩu Super Admin không đúng' });
    }

    res.cookie('super_admin_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 4 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      superAdmin: result.superAdmin,
      token: result.token
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Middleware bảo vệ các endpoint bên dưới
router.use(requireSuperAdmin);

// GET /api/super-admin/stores
router.get('/stores', async (req, res) => {
  try {
    const stores = await listStores();
    return res.json({ success: true, stores });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/stores
router.post('/stores', async (req, res) => {
  try {
    const store = await createStore(req.body || {});
    return res.status(201).json({ success: true, store });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/super-admin/stores/:id/status
router.put('/stores/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const result = await updateStoreStatus(req.params.id, status);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/super-admin/stores/:id
router.delete('/stores/:id', async (req, res) => {
  try {
    const result = await deleteStore(req.params.id);
    return res.json(result);
  } catch (err) {
    const status = err.message?.includes('không tồn tại') ? 404 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/stores/:storeId/branches
router.post('/stores/:storeId/branches', async (req, res) => {
  try {
    const branch = await createBranch(req.params.storeId, req.body || {});
    return res.status(201).json({ success: true, branch });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/super-admin/branches/:branchId/status
router.put('/branches/:branchId/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const result = await updateBranchStatus(req.params.branchId, status);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

async function assertTelegramScope(storeId, branchId = null) {
  if (!storeId) throw new Error('storeId là bắt buộc');
  if (!isDBConnected()) return;
  const store = await StoreModel.findOne({ id: storeId }).lean();
  if (!store) {
    const error = new Error('Cửa hàng không tồn tại');
    error.status = 404;
    throw error;
  }
  if (branchId) {
    const branch = await BranchModel.findOne({ id: branchId, storeId }).lean();
    if (!branch) {
      const error = new Error('Chi nhánh không thuộc cửa hàng đã chọn');
      error.status = 404;
      throw error;
    }
  }
}

// GET /api/super-admin/stores/:storeId/telegram-settings?branchId=...
router.get('/stores/:storeId/telegram-settings', async (req, res) => {
  try {
    const branchId = req.query.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    const settings = await getEffectiveSettings({ storeId: req.params.storeId, branchId });
    return res.json({ success: true, settings: await serializeSettings(settings) });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

// PUT /api/super-admin/stores/:storeId/telegram-settings
router.put('/stores/:storeId/telegram-settings', async (req, res) => {
  try {
    const branchId = req.body?.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    const saved = await upsertSettings({
      storeId: req.params.storeId,
      branchId,
      payload: req.body || {},
      actorId: req.superAdmin?.sub || 'super_admin'
    });
    await logAuditAction('super_admin', 'SUPER_ADMIN', 'UPDATE_TELEGRAM_SETTINGS', `${req.params.storeId}:${branchId || 'store'}`, { branchId }, req.params.storeId, branchId);
    return res.json({ success: true, settings: await serializeSettings(await getEffectiveSettings({ storeId: req.params.storeId, branchId })) });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

// DELETE /api/super-admin/stores/:storeId/telegram-settings?branchId=...
router.delete('/stores/:storeId/telegram-settings', async (req, res) => {
  try {
    const branchId = req.query.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    if (!branchId) throw new Error('Chỉ được reset cấu hình override của branch');
    const settings = await resetBranchSettings({ storeId: req.params.storeId, branchId });
    await logAuditAction('super_admin', 'SUPER_ADMIN', 'RESET_BRANCH_TELEGRAM_SETTINGS', branchId, {}, req.params.storeId, branchId);
    return res.json({ success: true, settings: await serializeSettings(settings) });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

router.get('/stores/:storeId/telegram-settings/access', async (req, res) => {
  try {
    const branchId = req.query.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    return res.json({ success: true, users: await listReportAccess({ storeId: req.params.storeId, branchId }) });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

router.put('/stores/:storeId/telegram-settings/access', async (req, res) => {
  try {
    const branchId = req.body?.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    const users = await replaceReportAccess({
      storeId: req.params.storeId,
      branchId,
      users: req.body?.users || [],
      actorId: req.superAdmin?.sub || 'super_admin'
    });
    await logAuditAction('super_admin', 'SUPER_ADMIN', 'UPDATE_TELEGRAM_REPORT_ACCESS', `${req.params.storeId}:${branchId || 'store'}`, { count: users.length }, req.params.storeId, branchId);
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

router.post('/stores/:storeId/telegram-settings/test', async (req, res) => {
  try {
    const branchId = req.body?.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    const settings = await getEffectiveSettings({ storeId: req.params.storeId, branchId });
    const chatId = req.body?.chatId || settings.chatId;
    const result = await telegramClient.sendTelegramMessage({
      chatId,
      telegramConfig: settings,
      text: `🤖 <b>TEST KẾT NỐI TELEGRAM</b>\n\nStore: <code>${req.params.storeId}</code>\nBranch: <code>${branchId || 'STORE_DEFAULT'}</code>\nThời gian: ${new Date().toLocaleString('vi-VN')}`,
      parseMode: 'HTML'
    });
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/stores/:storeId/telegram-settings/webhook-status', async (req, res) => {
  try {
    const branchId = req.query.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    const settings = await getEffectiveSettings({ storeId: req.params.storeId, branchId });
    const webhookInfo = await telegramClient.getWebhookInfo(settings);
    return res.json({ success: true, webhookInfo });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/stores/:storeId/telegram-settings/register-webhook', async (req, res) => {
  try {
    const branchId = req.body?.branchId || null;
    await assertTelegramScope(req.params.storeId, branchId);
    const settings = await getEffectiveSettings({ storeId: req.params.storeId, branchId });
    const baseUrl = (req.body?.publicBaseUrl || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    if (!baseUrl) throw new Error('Thiếu PUBLIC_BASE_URL');
    const webhookUrl = `${baseUrl}/api/telegram/webhook/${encodeURIComponent(req.params.storeId)}`;
    const result = await telegramClient.setWebhook(webhookUrl, settings.webhookSecret, settings);
    return res.json({ success: true, webhookUrl, result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/super-admin/audit-logs
router.get('/audit-logs', async (req, res) => {
  try {
    let logs = [];
    if (isDBConnected()) {
      logs = await AuditLogModel.find().sort({ timestamp: -1 }).limit(100).lean();
    }
    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
