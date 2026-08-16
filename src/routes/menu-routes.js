const express = require('express');
const router = express.Router();
const menuService = require('../services/menu-service');
const { requireAuth, requirePermission, optionalAuth } = require('../middleware/auth');
const { PERMISSIONS } = require('../auth/permissions');

// GET /api/menu - Get menu catalog
router.get('/', optionalAuth, async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true' && req.user && req.user.permissions?.includes(PERMISSIONS.CATALOG_READ);
    const items = req.tenantContext
      ? await menuService.getMenuForTenant(req.tenantContext, { includeDeleted })
      : await menuService.getMenu();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy thực đơn' });
  }
});

// POST /api/menu - Add or update master menu item info (Catalog Write)
router.post('/', requireAuth, requirePermission(PERMISSIONS.CATALOG_WRITE), async (req, res) => {
  try {
    const saved = await menuService.saveMenuItem(req.body, req.tenantContext);
    res.status(200).json({ item: saved });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/menu/:id/inventory - Update branch inventory stock (Inventory Write)
router.patch('/:id/inventory', requireAuth, requirePermission(PERMISSIONS.INVENTORY_WRITE), async (req, res) => {
  try {
    const { stockQuantity } = req.body || {};
    const updated = await menuService.updateInventory(req.params.id, stockQuantity, req.tenantContext, req.user);
    res.json({ item: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/menu/:id/status - Toggle active/suspended state (Menu Status Write)
router.put('/:id/status', requireAuth, requirePermission(PERMISSIONS.MENU_STATUS_WRITE), async (req, res) => {
  try {
    const { active } = req.body || {};
    const updated = await menuService.toggleItemActive(req.params.id, Boolean(active), req.tenantContext, req.user);
    res.json({ item: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/menu/:id - Soft delete menu item (Catalog Delete)
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.CATALOG_DELETE), async (req, res) => {
  try {
    const deleted = await menuService.softDeleteMenuItem(req.params.id, req.tenantContext, req.user);
    res.json({ message: 'Đã xóa món ăn thành công', item: deleted });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/menu/:id/restore - Restore soft deleted menu item (Catalog Delete)
router.post('/:id/restore', requireAuth, requirePermission(PERMISSIONS.CATALOG_DELETE), async (req, res) => {
  try {
    const restored = await menuService.restoreMenuItem(req.params.id, req.tenantContext, req.user);
    res.json({ message: 'Đã khôi phục món ăn thành công', item: restored });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

