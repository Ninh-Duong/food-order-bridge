const express = require('express');
const router = express.Router();
const menuRepository = require('../repositories/menu-repository');
const categoryRepository = require('../repositories/category-repository');
const orderRepository = require('../repositories/order-repository');

// POST /api/admin/reset-data - Reset categories and menu items to standardized defaults
router.post('/reset-data', async (req, res) => {
  try {
    const { clearOrders } = req.body || {};

    const categories = await categoryRepository.resetAndSeed();
    const items = await menuRepository.resetAndSeed();

    if (clearOrders) {
      await orderRepository.clearAll();
    }

    res.json({
      message: 'Đã chuẩn hóa và khôi phục toàn bộ dữ liệu thực đơn thành công!',
      categoriesCount: categories.length,
      itemsCount: items.length,
      ordersCleared: Boolean(clearOrders)
    });
  } catch (err) {
    console.error('Error resetting admin data:', err);
    res.status(500).json({ message: `Lỗi khi reset dữ liệu: ${err.message}` });
  }
});

module.exports = router;
