const authService = require('../services/auth-service');

function cookieValue(req, name) {
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}

function requireAuth(req, res, next) {
  const user = authService.parseToken(cookieValue(req, 'admin_session'));
  if (!user) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Chỉ tài khoản admin được thực hiện thao tác này' });
  next();
}

module.exports = { requireAuth, requireAdmin };
