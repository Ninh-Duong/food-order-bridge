const authService = require('../services/auth-service');
const userRepository = require('../repositories/user-repository');
const { hasPermission, getEffectivePermissions, PERMISSIONS } = require('../auth/permissions');
const { getCookieValue } = require('../utils/cookie');

function cookieValue(req, name) {
  return getCookieValue(req, name);
}

async function resolveUserFromToken(tokenUser) {
  if (!tokenUser || !tokenUser.sub || !tokenUser.storeId) return null;
  try {
    const tenantContext = { storeId: tokenUser.storeId };
    const dbUser = await userRepository.findByIdForTenant(tenantContext, tokenUser.sub);
    if (dbUser) {
      if (dbUser.active === false) return null;

      const permissions = getEffectivePermissions(dbUser);
      const userId = String(dbUser._id || dbUser.id || tokenUser.sub);

      return {
        sub: userId,
        id: userId,
        username: dbUser.username,
        role: dbUser.role,
        storeId: dbUser.storeId || tokenUser.storeId,
        branchId: tokenUser.branchId || null,
        branchIds: dbUser.branchIds || tokenUser.branchIds || [],
        permissionMode: dbUser.permissionMode || 'DEFAULT',
        assignedPermissions: dbUser.assignedPermissions || [],
        permissions
      };
    }

    // Fallback for synthetic / test tokens where user payload is present in JWT
    const permissions = getEffectivePermissions(tokenUser);
    return {
      sub: String(tokenUser.sub),
      id: String(tokenUser.sub),
      username: tokenUser.username || tokenUser.sub,
      role: tokenUser.role,
      storeId: tokenUser.storeId,
      branchId: tokenUser.branchId || null,
      branchIds: tokenUser.branchIds || ['legacy-main-branch'],
      permissionMode: tokenUser.permissionMode || 'DEFAULT',
      assignedPermissions: tokenUser.assignedPermissions || [],
      permissions
    };
  } catch (err) {
    return null;
  }
}


async function requireAuth(req, res, next) {
  const tokenUser = authService.parseToken(cookieValue(req, 'admin_session'));
  if (!tokenUser) return res.status(401).json({ message: 'Vui lòng đăng nhập' });

  const resolvedUser = await resolveUserFromToken(tokenUser);
  if (!resolvedUser) {
    return res.status(401).json({ message: 'Tài khoản đã bị khóa hoặc không tồn tại' });
  }

  req.user = resolvedUser;
  req.tenantContext = { storeId: resolvedUser.storeId, branchId: resolvedUser.branchId || null };
  next();
}

async function requirePageAuth(req, res, next) {
  const tokenUser = authService.parseToken(cookieValue(req, 'admin_session'));
  if (!tokenUser) {
    const returnUrl = encodeURIComponent(`${req.originalUrl || req.url || '/admin.html'}`);
    return res.redirect(`/login.html?returnUrl=${returnUrl}`);
  }

  const resolvedUser = await resolveUserFromToken(tokenUser);
  if (!resolvedUser) {
    const returnUrl = encodeURIComponent(`${req.originalUrl || req.url || '/admin.html'}`);
    return res.redirect(`/login.html?returnUrl=${returnUrl}`);
  }

  req.user = resolvedUser;
  req.tenantContext = { storeId: resolvedUser.storeId, branchId: resolvedUser.branchId || null };
  next();
}

async function optionalAuth(req, res, next) {
  const tokenUser = authService.parseToken(cookieValue(req, 'admin_session'));
  if (tokenUser) {
    const resolvedUser = await resolveUserFromToken(tokenUser);
    if (resolvedUser) {
      req.user = resolvedUser;
      req.tenantContext = { storeId: resolvedUser.storeId, branchId: resolvedUser.branchId || null };
    }
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
  if (!hasPermission(req.user, PERMISSIONS.STAFF_RULES_MANAGE) && !hasPermission(req.user, PERMISSIONS.OWNER_ADMIN)) {
    return res.status(403).json({ message: 'Chỉ tài khoản admin được thực hiện thao tác này' });
  }
  next();
}

module.exports = { cookieValue, requireAuth, requirePageAuth, optionalAuth, requirePermission, requireAdmin };

