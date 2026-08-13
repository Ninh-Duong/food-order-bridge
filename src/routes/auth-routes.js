const express = require('express');
const rateLimit = require('express-rate-limit');
const authService = require('../services/auth-service');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { message: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.' } });

// POST /api/auth/login (Username / Legacy Auth)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    if (!result) return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    res.cookie('admin_session', result.token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: authService.TOKEN_TTL_SECONDS * 1000, path: '/' });
    res.json({ user: result.user, token: result.token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/phone-login (SĐT Việt Nam E.164)
router.post('/phone-login', loginLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const result = await authService.loginByPhone(phone, password);

    if (!result) {
      return res.status(401).json({ message: 'Số điện thoại hoặc mật khẩu không đúng' });
    }

    // Nếu chỉ có 1 branch -> tự chọn luôn
    if (result.branches && result.branches.length === 1) {
      const activeBranchId = result.branches[0].id;
      const parsedUser = authService.parseToken(result.preToken);
      const sessionResult = await authService.selectBranch(parsedUser, activeBranchId);

      res.cookie('admin_session', sessionResult.sessionToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: authService.TOKEN_TTL_SECONDS * 1000,
        path: '/'
      });

      return res.json({
        requiresBranchSelection: false,
        user: result.user,
        activeBranchId,
        sessionToken: sessionResult.sessionToken
      });
    }

    return res.json({
      requiresBranchSelection: true,
      user: result.user,
      branches: result.branches,
      preToken: result.preToken
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/auth/select-branch
router.post('/select-branch', async (req, res) => {
  try {
    const { preToken, branchId } = req.body || {};
    const currentToken = preToken || req.cookies?.admin_session || req.headers['authorization']?.replace('Bearer ', '');
    const userPayload = authService.parseToken(currentToken);

    if (!userPayload) {
      return res.status(401).json({ message: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.' });
    }

    const sessionResult = await authService.selectBranch(userPayload, branchId);

    res.cookie('admin_session', sessionResult.sessionToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: authService.TOKEN_TTL_SECONDS * 1000,
      path: '/'
    });

    return res.json({
      success: true,
      activeBranchId: sessionResult.activeBranchId,
      sessionToken: sessionResult.sessionToken
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_session', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.clearCookie('super_admin_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
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
