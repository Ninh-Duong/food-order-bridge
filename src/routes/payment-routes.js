const express = require('express');
const router = express.Router();
const orderService = require('../services/order-service');

// POST /api/payments/momo/ipn - MoMo server-to-server payment notification
router.post('/momo/ipn', async (req, res) => {
  try {
    await orderService.handleMomoIpn(req.body);
    return res.status(204).send();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('Unhandled MoMo IPN Error:', err);
    return res.status(500).json({ message: 'Lỗi xử lý IPN MoMo' });
  }
});

module.exports = router;
