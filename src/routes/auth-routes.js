const express = require('express');
const rateLimit = require('express-rate-limit');
const authService = require('../services/auth-service');
const { cookieValue, requireAuth, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../auth/permissions');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { message: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.' } });

// POST /api/auth/login (Username / Legacy Auth)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    if (!result) return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    res.cookie('admin_session', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: authService.TOKEN_TTL_SECONDS * 1000, path: '/' });
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
    if (!result.branches || result.branches.length === 0) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán chi nhánh đang hoạt động. Vui lòng liên hệ chủ cửa hàng.' });
    }

    // Nếu chỉ có 1 branch -> tự chọn luôn
    if (result.branches && result.branches.length === 1) {
      const activeBranchId = result.branches[0].id;
      const parsedUser = authService.parseToken(result.preToken);
      const sessionResult = await authService.selectBranch(parsedUser, activeBranchId);

      res.cookie('admin_session', sessionResult.sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: authService.TOKEN_TTL_SECONDS * 1000,
        path: '/'
      });

      return res.json({
        requiresBranchSelection: false,
        user: result.user,
        activeBranchId
      });
    }

    res.cookie('merchant_pre_session', result.preToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/api/auth'
    });

    return res.json({
      requiresBranchSelection: true,
      user: result.user,
      branches: result.branches
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/auth/select-branch
router.post('/select-branch', async (req, res) => {
  try {
    const { preToken, branchId } = req.body || {};
    const currentToken = cookieValue(req, 'merchant_pre_session')
      || cookieValue(req, 'admin_session')
      || preToken
      || req.headers['authorization']?.replace('Bearer ', '');
    const userPayload = authService.parseToken(currentToken);

    if (!userPayload) {
      return res.status(401).json({ message: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.' });
    }

    const sessionResult = await authService.selectBranch(userPayload, branchId);

    res.cookie('admin_session', sessionResult.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: authService.TOKEN_TTL_SECONDS * 1000,
      path: '/'
    });
    res.clearCookie('merchant_pre_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/auth' });

    return res.json({
      success: true,
      activeBranchId: sessionResult.activeBranchId
    });
  } catch (err) {
    const status = err.message?.includes('không có quyền') || err.message?.includes('không thuộc') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
});

// POST /api/auth/switch-branch - Switch an already authenticated merchant session
router.post('/switch-branch', requireAuth, async (req, res) => {
  try {
    const { branchId } = req.body || {};
    const sessionResult = await authService.selectBranch(req.user, branchId);

    res.cookie('admin_session', sessionResult.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: authService.TOKEN_TTL_SECONDS * 1000,
      path: '/'
    });

    return res.json({ success: true, activeBranchId: sessionResult.activeBranchId });
  } catch (err) {
    const status = err.message?.includes('không có quyền') || err.message?.includes('không thuộc') ? 403 : 400;
    return res.status(status).json({ message: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.clearCookie('merchant_pre_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/auth' });
  res.clearCookie('super_admin_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ message: 'Đã đăng xuất' });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.get('/bootstrap', requireAuth, async (req, res) => {
  try {
    res.json(await authService.getBootstrap(req.user));
  } catch (err) {
    const status = Number.isInteger(err.status) ? err.status : 500;
    res.status(status).json({ message: err.message || 'Không thể tải dữ liệu cửa hàng' });
  }
});

// Staff Management Routes
router.get('/staff', requireAuth, (req, res, next) => {
  if (req.user.permissions.includes(PERMISSIONS.STAFF_MANAGE) || req.user.permissions.includes(PERMISSIONS.STAFF_RULES_MANAGE)) {
    return next();
  }
  return res.status(403).json({ message: 'Bạn không có quyền xem danh sách nhân viên' });
}, async (req, res) => {
  try {
    res.json({ users: await authService.listStaff(req.tenantContext) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/staff', requireAuth, requirePermission(PERMISSIONS.STAFF_MANAGE), async (req, res) => {
  try {
    res.status(201).json({ user: await authService.createStaff(req.body.username, req.body.password, req.tenantContext) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/permissions/catalog', requireAuth, requirePermission(PERMISSIONS.STAFF_RULES_MANAGE), (req, res) => {
  res.json({ catalog: authService.getPermissionCatalog() });
});

router.put('/staff/:id/permissions', requireAuth, requirePermission(PERMISSIONS.STAFF_RULES_MANAGE), async (req, res) => {
  try {
    const updated = await authService.updateStaffPermissions(req.tenantContext, req.params.id, req.body || {}, req.user);
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/staff/:id/status', requireAuth, (req, res, next) => {
  if (req.user.permissions.includes(PERMISSIONS.STAFF_MANAGE) || req.user.permissions.includes(PERMISSIONS.STAFF_RULES_MANAGE)) {
    return next();
  }
  return res.status(403).json({ message: 'Bạn không có quyền khóa / mở khóa tài khoản' });
}, async (req, res) => {
  try {
    const updated = await authService.updateStaffStatus(req.tenantContext, req.params.id, req.body || {}, req.user);
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

