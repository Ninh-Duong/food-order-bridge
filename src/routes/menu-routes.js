const express = require('express');
const router = express.Router();
const menuService = require('../services/menu-service');

// GET /api/menu - Get menu catalog
router.get('/', (req, res) => {
  try {
    const items = menuService.getMenu();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy thực đơn' });
  }
});

// POST /api/menu - Add or update menu item (Admin)
router.post('/', (req, res) => {
  try {
    const saved = menuService.saveMenuItem(req.body);
    res.status(200).json({ item: saved });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/menu/:id/status - Toggle active state (Admin)
router.put('/:id/status', (req, res) => {
  try {
    const { active } = req.body;
    const updated = menuService.toggleItemActive(req.params.id, Boolean(active));
    res.json({ item: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
