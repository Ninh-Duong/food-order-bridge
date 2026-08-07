const express = require('express');
const router = express.Router();
const orderService = require('../services/order-service');

// POST /api/orders - Submit order
router.post('/', async (req, res) => {
  try {
    const { statusCode, result } = await orderService.processOrder(req.body);
    res.status(statusCode).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('Unhandled Order Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi xử lý đơn hàng' });
  }
});

// GET /api/orders - List all orders (Admin)
router.get('/', async (req, res) => {
  try {
    const orders = await orderService.getAllOrders();
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy danh sách đơn hàng' });
  }
});

// GET /api/orders/:orderId - Check order status
router.get('/:orderId', async (req, res) => {
  try {
    const order = await orderService.getOrderStatus(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi kiểm tra đơn hàng' });
  }
});

module.exports = router;
