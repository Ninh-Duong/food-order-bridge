const express = require('express');
const router = express.Router();
const {
  loginSuperAdmin,
  requireSuperAdmin,
  listStores,
  createStore,
  updateStoreStatus,
  createBranch,
  updateBranchStatus
} = require('../services/super-admin-service');
const { AuditLogModel } = require('../models');
const { isDBConnected } = require('../db');

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
