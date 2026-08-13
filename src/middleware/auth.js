const authService = require('../services/auth-service');
const { hasPermission, PERMISSIONS } = require('../auth/permissions');

function cookieValue(req, name) {
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}

function requireAuth(req, res, next) {
  const user = authService.parseToken(cookieValue(req, 'admin_session'));
  if (!user) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
  req.user = user;
  req.tenantContext = { storeId: user.storeId, branchId: user.branchId || null };
  next();
}

function requirePageAuth(req, res, next) {
  const user = authService.parseToken(cookieValue(req, 'admin_session'));
  if (!user) {
    const returnUrl = encodeURIComponent(`${req.originalUrl || req.url || '/admin.html'}`);
    return res.redirect(`/login.html?returnUrl=${returnUrl}`);
  }
  req.user = user;
  req.tenantContext = { storeId: user.storeId, branchId: user.branchId || null };
  next();
}

function optionalAuth(req, res, next) {
  const user = authService.parseToken(cookieValue(req, 'admin_session'));
  if (user) {
    req.user = user;
    req.tenantContext = { storeId: user.storeId, branchId: user.branchId || null };
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này', permission });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!hasPermission(req.user, PERMISSIONS.OWNER_ADMIN)) {
    return res.status(403).json({ message: 'Chỉ tài khoản admin được thực hiện thao tác này' });
  }
  next();
}

module.exports = { cookieValue, requireAuth, requirePageAuth, optionalAuth, requirePermission, requireAdmin };
