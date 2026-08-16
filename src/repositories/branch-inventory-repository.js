const { BranchInventoryModel } = require('../models');
const { isDBConnected } = require('../db');
const { assertTenantContext } = require('../middleware/tenant-context');

class BranchInventoryRepository {
  async listForTenant(tenantContext) {
    const { storeId, branchId } = assertTenantContext(tenantContext);
    if (!branchId) return [];
    if (!isDBConnected()) return [];
    return BranchInventoryModel.find({ storeId, branchId }).lean();
  }

  async decrementAtomic(tenantContext, menuItemId, quantity, session = null) {
    const { storeId, branchId } = assertTenantContext(tenantContext);
    if (!branchId || !isDBConnected()) return null;
    const updated = await BranchInventoryModel.findOneAndUpdate(
      { storeId, branchId, menuItemId, active: true, stockQuantity: { $gte: quantity } },
      { $inc: { stockQuantity: -quantity }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after', ...(session ? { session } : {}) }
    ).lean();
    return updated || null;
  }

  async updateStock(tenantContext, menuItemId, stockQuantity) {
    const { storeId, branchId } = assertTenantContext(tenantContext);
    if (!branchId || !isDBConnected()) return null;
    return BranchInventoryModel.findOneAndUpdate(
      { storeId, branchId, menuItemId },
      { $set: { stockQuantity, updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
  }

  async updateActive(tenantContext, menuItemId, active) {
    const { storeId, branchId } = assertTenantContext(tenantContext);
    if (!branchId || !isDBConnected()) return null;
    return BranchInventoryModel.findOneAndUpdate(
      { storeId, branchId, menuItemId },
      { $set: { active: Boolean(active), updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
  }
}

module.exports = new BranchInventoryRepository();

