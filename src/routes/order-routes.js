const express = require('express');
const router = express.Router();
const orderService = require('../services/order-service');
const { requireAuth } = require('../middleware/auth');

// POST /api/orders - Submit order
router.post('/', async (req, res) => {
  try {
    const { statusCode, result } = await orderService.processOrder(req.body);
    res.status(statusCode).json(result);
  } catch (err) {
    if (err.status) {
      const payload = { message: err.message };
      if (err.code) payload.code = err.code;
      if (err.items) payload.items = err.items;
      if (err.pendingCount !== undefined) payload.pendingCount = err.pendingCount;
      if (err.limit !== undefined) payload.limit = err.limit;
      return res.status(err.status).json(payload);
    }
    console.error('Unhandled Order Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi xử lý đơn hàng' });
  }
});

// GET /api/orders - List all orders with pagination (Admin/Staff)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const data = await orderService.getAllOrders({ page, limit });
    res.json(data);
  } catch (err) {
    console.error('Unhandled Get Orders Error:', err);
    res.status(500).json({ message: 'Lỗi lấy danh sách đơn hàng' });
  }
});

// GET /api/orders/payment-capacity - Public storefront pre-check
router.get('/payment-capacity', async (req, res) => {
  try {
    res.json(await orderService.getPaymentCapacityStatus());
  } catch (err) {
    console.error('Unhandled Payment Capacity Error:', err);
    res.status(500).json({ message: 'Lỗi kiểm tra khả năng tiếp nhận đơn hàng' });
  }
});

// POST /api/orders/:orderId/payment/mock-complete - Test-only payment bypass
router.post('/:orderId/payment/mock-complete', async (req, res) => {
  try {
    const updatedOrder = await orderService.completeMockPayment(req.params.orderId);
    res.json({ order: updatedOrder });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('Unhandled Mock Payment Error:', err);
    res.status(500).json({ message: 'Lỗi mock hoàn thành thanh toán' });
  }
});

// POST /api/orders/:orderId/cancel - Customer cancellation before payment
router.post('/:orderId/cancel', async (req, res) => {
  try {
    const order = await orderService.cancelOrder(req.params.orderId, req.body?.actionToken);
    res.json({ order });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error('Unhandled Order Cancel Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi hủy đơn hàng' });
  }
});

// POST /api/orders/:orderId/admin-cancel - Admin/Staff cancellation before payment
router.post('/:orderId/admin-cancel', requireAuth, async (req, res) => {
  try {
    const order = await orderService.adminCancelOrder(req.params.orderId, req.user);
    res.json({ order });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error('Unhandled Admin Order Cancel Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi hủy đơn hàng' });
  }
});

// POST /api/orders/:orderId/retry - Create a new DINE_IN order from a cancelled order
router.post('/:orderId/retry', async (req, res) => {
  try {
    const result = await orderService.retryOrder(
      req.params.orderId,
      req.body?.actionToken,
      req.body?.paymentMethod
    );
    res.status(result.statusCode || 201).json(result.result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message, code: err.code, items: err.items });
    console.error('Unhandled Order Retry Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi thanh toán lại đơn hàng' });
  }
});

// PUT /api/orders/:orderId/payment - Update payment status (Staff/Admin)
router.put('/:orderId/payment', requireAuth, async (req, res) => {
  try {
    const { isPaid } = req.body;
    if (typeof isPaid !== 'boolean') {
      return res.status(400).json({ message: 'Trạng thái isPaid phải là kiểu boolean' });
    }
    const updatedOrder = await orderService.setPaymentStatus(req.params.orderId, isPaid, req.user);
    res.json({ order: updatedOrder });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('Unhandled Payment Status Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật trạng thái thanh toán' });
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
