const express = require('express');
const rateLimit = require('express-rate-limit');
const authService = require('../services/auth-service');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { message: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.' } });

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    if (!result) return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    res.cookie('admin_session', result.token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: authService.TOKEN_TTL_SECONDS * 1000, path: '/' });
    res.json({ user: result.user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_session', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ message: 'Đã đăng xuất' });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
router.get('/staff', requireAuth, requireAdmin, async (req, res) => res.json({ users: await authService.listStaff() }));
router.post('/staff', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.status(201).json({ user: await authService.createStaff(req.body.username, req.body.password) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
