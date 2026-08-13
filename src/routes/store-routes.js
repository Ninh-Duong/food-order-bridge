const express = require('express');
const router = express.Router();
const config = require('../config');
const { isDBConnected } = require('../db');
const { StoreModel, BranchModel } = require('../models');

// GET /api/store/info - Public API returning store & branch info for Storefront Header
router.get('/info', async (req, res) => {
  try {
    const tenantCtx = req.tenantContext || {};
    const storeId = tenantCtx.storeId || 'legacy-store';
    const branchId = tenantCtx.branchId || 'legacy-main-branch';

    let storeName = config.SHOP_NAME || 'Food Order Shop';
    let branchName = '';

    if (isDBConnected()) {
      try {
        const store = await StoreModel.findOne({ id: storeId }).lean();
        if (store && store.name) {
          storeName = store.name;
        }

        const branch = await BranchModel.findOne({ storeId, id: branchId }).lean();
        if (branch && branch.name) {
          branchName = branch.name;
        }
      } catch (err) {
        console.error('Error fetching store info from DB:', err.message);
      }
    }

    res.json({
      success: true,
      storeId,
      branchId,
      storeName,
      branchName,
      displayName: branchName ? `${storeName} - ${branchName}` : storeName,
      status: 'OPEN'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Không thể lấy thông tin cửa hàng',
      storeName: config.SHOP_NAME || 'Food Order Shop'
    });
  }
});

module.exports = router;
