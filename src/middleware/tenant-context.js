class TenantContextMissingError extends Error {
  constructor(message = 'Tenant context (storeId) là bắt buộc') {
    super(message);
    this.name = 'TenantContextMissingError';
    this.statusCode = 400;
  }
}

/**
 * Kiểm tra và bảo vệ Tenant Context (Fail-Fast Tenant Context Guard)
 * @param {Object} tenantCtx - Object chứa { storeId, branchId }
 * @returns {Object} tenantCtx
 */
function assertTenantContext(tenantCtx) {
  if (!tenantCtx || typeof tenantCtx !== 'object' || !tenantCtx.storeId) {
    throw new TenantContextMissingError('Tenant context missing or invalid: storeId is required');
  }
  return tenantCtx;
}

/**
 * Middleware Express trích xuất Tenant Context từ Session
 */
function extractTenantContext(req, res, next) {
  const storeId = req.user?.storeId || process.env.DEFAULT_STORE_ID || 'legacy-store';
  const branchId = req.user?.branchId || process.env.DEFAULT_BRANCH_ID || 'legacy-main-branch';

  req.tenantContext = {
    storeId,
    branchId
  };

  next();
}

module.exports = {
  TenantContextMissingError,
  assertTenantContext,
  extractTenantContext
};
