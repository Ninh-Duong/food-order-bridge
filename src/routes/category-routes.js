const express = require('express');
const router = express.Router();
const categoryService = require('../services/category-service');
const { requireAuth, requirePermission, optionalAuth } = require('../middleware/auth');
const { PERMISSIONS } = require('../auth/permissions');

// GET /api/categories - Get all categories (Public)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const categories = req.tenantContext
      ? await categoryService.getCategoriesForTenant(req.tenantContext)
      : await categoryService.getCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy danh sách danh mục' });
  }
});

// GET /api/categories/:id - Get category by ID (Public)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const category = await categoryService.getCategory(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }
    res.json({ category });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy thông tin danh mục' });
  }
});

// POST /api/categories - Create category (Categories Write)
router.post('/', requireAuth, requirePermission(PERMISSIONS.CATEGORIES_WRITE), async (req, res) => {
  try {
    const category = await categoryService.createCategory(req.body, req.tenantContext);
    res.status(201).json({ category });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/categories/:id - Update category (Categories Write)
router.put('/:id', requireAuth, requirePermission(PERMISSIONS.CATEGORIES_WRITE), async (req, res) => {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body, req.tenantContext);
    res.status(200).json({ category });
  } catch (err) {
    const status = err.message && err.message.includes('Không tìm thấy') ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
});

// PUT /api/categories/:id/status - Toggle active state (Categories Write)
router.put('/:id/status', requireAuth, requirePermission(PERMISSIONS.CATEGORIES_WRITE), async (req, res) => {
  try {
    const { active } = req.body;
    const category = await categoryService.toggleCategoryActive(req.params.id, active, req.tenantContext);
    res.status(200).json({ category });
  } catch (err) {
    const status = err.message && err.message.includes('Không tìm thấy') ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
});

module.exports = router;

