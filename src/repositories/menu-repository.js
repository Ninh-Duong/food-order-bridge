const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const { MenuItemModel } = require('../models');
const { assertTenantContext } = require('../middleware/tenant-context');
const branchInventoryRepository = require('./branch-inventory-repository');

const MENU_FILE = path.join(__dirname, '..', 'data', 'menu.json');

class MenuRepository {
  async getAllForTenant(tenantContext, options = {}) {
    const { storeId } = assertTenantContext(tenantContext);
    const includeDeleted = Boolean(options.includeDeleted);
    if (isDBConnected()) {
      const filter = { storeId };
      if (!includeDeleted) {
        filter.$or = [{ deletedAt: null }, { deletedAt: { $exists: false } }];
      }
      const items = await MenuItemModel.find(filter).lean();
      const inventory = await branchInventoryRepository.listForTenant(tenantContext);
      const inventoryByItem = new Map(inventory.map((record) => [record.menuItemId, record]));
      return items.map((item) => {
        const branchRecord = inventoryByItem.get(item.id);
        return this.cleanItem(branchRecord ? {
          ...item,
          stockQuantity: branchRecord.stockQuantity,
          active: branchRecord.active !== false,
          ...(branchRecord.priceOverride !== null && branchRecord.priceOverride !== undefined ? { price: branchRecord.priceOverride } : {})
        } : item);
      });
    }
    return this.getFromFile().filter((item) => (item.storeId || 'legacy-store') === storeId && (includeDeleted || !item.deletedAt));
  }

  cleanItem(item) {
    if (!item) return null;
    const { _id, __v, ...rest } = item;
    const id = rest.id || _id;

    const stockQuantity = Number.isInteger(rest.stockQuantity) && rest.stockQuantity >= 0
      ? rest.stockQuantity
      : (rest.stockQuantity === undefined ? 20 : 0);

    const discountPercent = Number.isFinite(rest.discountPercent)
      ? Math.max(0, Math.min(100, Number(rest.discountPercent)))
      : 0;

    return {
      ...rest,
      id,
      price: Number(rest.price) || 0,
      discountPercent,
      stockQuantity,
      deletedAt: rest.deletedAt || null,
      deletedBy: rest.deletedBy || null
    };
  }

  async getAll() {
    if (isDBConnected()) {
      try {
        let items = await MenuItemModel.find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] }).lean();
        if (!items || items.length === 0) {
          const defaultItems = this.getFromFile();
          if (defaultItems.length > 0) {
            console.log('🌱 Seeding initial menu items to MongoDB...');
            await MenuItemModel.insertMany(defaultItems);
            items = await MenuItemModel.find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] }).lean();
          }
        }
        return items.map(i => this.cleanItem(i));
      } catch (err) {
        console.error('Error fetching menu from MongoDB:', err.message);
        throw err;
      }
    }
    return this.getFromFile().filter(i => !i.deletedAt);
  }

  getFromFile() {
    try {
      if (fs.existsSync(MENU_FILE)) {
        const raw = fs.readFileSync(MENU_FILE, 'utf8');
        if (!raw || !raw.trim()) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(i => this.cleanItem(i));
        }
      }
    } catch (err) {
      console.error('Error reading menu.json:', err.message);
    }
    return [];
  }

  async getById(id) {
    if (!id) return null;
    if (isDBConnected()) {
      try {
        const item = await MenuItemModel.findOne({ id }).lean();
        if (item) return this.cleanItem(item);
        return null;
      } catch (err) {
        console.error('Error fetching item by id from MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    return items.find(i => i.id === id) || null;
  }

  async getByIdForTenant(tenantContext, id, options = {}) {
    const { storeId } = assertTenantContext(tenantContext);
    if (!id) return null;
    const includeDeleted = Boolean(options.includeDeleted);
    if (isDBConnected()) {
      const filter = { id, storeId };
      if (!includeDeleted) {
        filter.$or = [{ deletedAt: null }, { deletedAt: { $exists: false } }];
      }
      const item = await MenuItemModel.findOne(filter).lean();
      return item ? this.cleanItem(item) : null;
    }
    return this.getFromFile().find((item) => item.id === id && (item.storeId || 'legacy-store') === storeId && (includeDeleted || !item.deletedAt)) || null;
  }

  saveAll(items) {
    fs.mkdirSync(path.dirname(MENU_FILE), { recursive: true });
    const tempFile = `${MENU_FILE}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cleaned = items.map(i => this.cleanItem(i));
    fs.writeFileSync(tempFile, JSON.stringify(cleaned, null, 2), 'utf8');
    try {
      fs.renameSync(tempFile, MENU_FILE);
    } catch (e) {
      fs.writeFileSync(MENU_FILE, JSON.stringify(cleaned, null, 2), 'utf8');
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
    return cleaned;
  }

  async saveOrUpdate(itemData, tenantContext = null) {
    if (tenantContext) assertTenantContext(tenantContext);
    const cleanedData = this.cleanItem(itemData);
    if (isDBConnected()) {
      try {
        const updated = await MenuItemModel.findOneAndUpdate(
          { id: cleanedData.id, ...(tenantContext ? { storeId: tenantContext.storeId } : {}) },
          { $set: cleanedData },
          { upsert: true, returnDocument: 'after', runValidators: true }
        ).lean();
        return this.cleanItem(updated);
      } catch (err) {
        console.error('Error saving item to MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    const index = items.findIndex(i => i.id === cleanedData.id && (!tenantContext || (i.storeId || 'legacy-store') === tenantContext.storeId));
    if (index >= 0) {
      items[index] = { ...items[index], ...cleanedData };
    } else {
      items.push(cleanedData);
    }
    this.saveAll(items);
    return cleanedData;
  }

  async updateInventoryForTenant(tenantContext, id, stockQuantity) {
    const { storeId } = assertTenantContext(tenantContext);
    if (tenantContext.branchId && isDBConnected()) {
      await branchInventoryRepository.updateStock(tenantContext, id, stockQuantity);
    }
    if (isDBConnected()) {
      const updated = await MenuItemModel.findOneAndUpdate(
        { id, storeId },
        { $set: { stockQuantity, updatedAt: new Date() } },
        { returnDocument: 'after' }
      ).lean();
      return updated ? this.cleanItem(updated) : null;
    }
    const items = this.getFromFile();
    const item = items.find(i => i.id === id && (i.storeId || 'legacy-store') === storeId);
    if (item) {
      item.stockQuantity = stockQuantity;
      item.updatedAt = new Date().toISOString();
      this.saveAll(items);
      return item;
    }
    return null;
  }

  async toggleActive(id, activeState, tenantContext = null) {
    if (tenantContext) {
      assertTenantContext(tenantContext);
      if (tenantContext.branchId && isDBConnected()) {
        await branchInventoryRepository.updateActive(tenantContext, id, activeState);
      }
    }
    if (isDBConnected()) {
      try {
        const updated = await MenuItemModel.findOneAndUpdate(
          { id, ...(tenantContext ? { storeId: tenantContext.storeId } : {}) },
          { $set: { active: activeState, updatedAt: new Date() } },
          { returnDocument: 'after' }
        ).lean();
        if (updated) return this.cleanItem(updated);
        return null;
      } catch (err) {
        console.error('Error toggling item status in MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    const item = items.find(i => i.id === id && (!tenantContext || (i.storeId || 'legacy-store') === tenantContext.storeId));
    if (item) {
      item.active = activeState;
      item.updatedAt = new Date().toISOString();
      this.saveAll(items);
      return item;
    }
    return null;
  }

  async softDeleteForTenant(tenantContext, id, actorUserId = null) {
    const { storeId } = assertTenantContext(tenantContext);
    const now = new Date();
    if (isDBConnected()) {
      const updated = await MenuItemModel.findOneAndUpdate(
        { id, storeId },
        { $set: { deletedAt: now, deletedBy: actorUserId || null, updatedAt: now } },
        { returnDocument: 'after' }
      ).lean();
      return updated ? this.cleanItem(updated) : null;
    }
    const items = this.getFromFile();
    const item = items.find(i => i.id === id && (i.storeId || 'legacy-store') === storeId);
    if (item) {
      item.deletedAt = now.toISOString();
      item.deletedBy = actorUserId || null;
      item.updatedAt = now.toISOString();
      this.saveAll(items);
      return item;
    }
    return null;
  }

  async restoreForTenant(tenantContext, id) {
    const { storeId } = assertTenantContext(tenantContext);
    const now = new Date();
    if (isDBConnected()) {
      const updated = await MenuItemModel.findOneAndUpdate(
        { id, storeId },
        { $set: { deletedAt: null, deletedBy: null, updatedAt: now } },
        { returnDocument: 'after' }
      ).lean();
      return updated ? this.cleanItem(updated) : null;
    }
    const items = this.getFromFile();
    const item = items.find(i => i.id === id && (i.storeId || 'legacy-store') === storeId);
    if (item) {
      item.deletedAt = null;
      item.deletedBy = null;
      item.updatedAt = now.toISOString();
      this.saveAll(items);
      return item;
    }
    return null;
  }


  async countByCategoryId(categoryId) {
    if (!categoryId) return 0;
    const upperId = categoryId.trim().toUpperCase();
    if (isDBConnected()) {
      try {
        return await MenuItemModel.countDocuments({ categoryId: upperId });
      } catch (err) {
        console.error('Error counting items by categoryId in MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    return items.filter(i => (i.categoryId || '').toUpperCase() === upperId).length;
  }

  async countByCategoryIdForTenant(tenantContext, categoryId) {
    const { storeId } = assertTenantContext(tenantContext);
    if (!categoryId) return 0;
    const upperId = categoryId.trim().toUpperCase();
    if (isDBConnected()) return MenuItemModel.countDocuments({ storeId, categoryId: upperId });
    return this.getFromFile().filter((item) => (item.storeId || 'legacy-store') === storeId && (item.categoryId || '').toUpperCase() === upperId).length;
  }

  async getByCategoryId(categoryId) {
    if (!categoryId) return [];
    const upperId = categoryId.trim().toUpperCase();
    if (isDBConnected()) {
      try {
        const items = await MenuItemModel.find({ categoryId: upperId }).lean();
        return items.map(i => this.cleanItem(i));
      } catch (err) {
        console.error('Error fetching items by categoryId in MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    return items.filter(i => (i.categoryId || '').toUpperCase() === upperId);
  }

  async updateCategorySnapshot(categoryId, categoryName, tenantContext = null) {
    if (tenantContext) assertTenantContext(tenantContext);
    if (!categoryId || !categoryName) return;
    const upperId = categoryId.trim().toUpperCase();
    const cleanName = categoryName.trim();

    if (isDBConnected()) {
      try {
        await MenuItemModel.updateMany(
          { categoryId: upperId, ...(tenantContext ? { storeId: tenantContext.storeId } : {}) },
          { $set: { category: cleanName, updatedAt: new Date() } }
        );
      } catch (err) {
        console.error('Error updating category snapshot in MongoDB:', err.message);
        throw err;
      }
    }

    const items = this.getFromFile();
    let modified = false;
    items.forEach(item => {
      if ((item.categoryId || '').toUpperCase() === upperId && (!tenantContext || (item.storeId || 'legacy-store') === tenantContext.storeId)) {
        item.category = cleanName;
        modified = true;
      }
    });

    if (modified) {
      this.saveAll(items);
    }
  }

  /**
   * MongoDB Atomic Decrement within a Transaction session
   * Decrements stockQuantity if active !== false AND stockQuantity >= quantity
   */
  async decrementStockInTransaction(productId, requestedQuantity, session, tenantContext = null) {
    if (tenantContext?.branchId && isDBConnected()) {
      const updatedInventory = await branchInventoryRepository.decrementAtomic(tenantContext, productId, requestedQuantity, session);
      if (!updatedInventory) return null;
      const item = await MenuItemModel.findOne({ id: productId, storeId: tenantContext.storeId }).lean();
      return item ? this.cleanItem({ ...item, stockQuantity: updatedInventory.stockQuantity, active: updatedInventory.active }) : null;
    }
    const updated = await MenuItemModel.findOneAndUpdate(
      {
        id: productId,
        active: { $ne: false },
        stockQuantity: { $gte: requestedQuantity }
      },
      {
        $inc: { stockQuantity: -requestedQuantity },
        $set: { updatedAt: new Date() }
      },
      {
        returnDocument: 'after',
        session
      }
    ).lean();

    return updated ? this.cleanItem(updated) : null;
  }

  async decrementStockAtomic(productId, requestedQuantity, tenantContext = null) {
    if (tenantContext?.branchId && isDBConnected()) {
      const updatedInventory = await branchInventoryRepository.decrementAtomic(tenantContext, productId, requestedQuantity);
      if (!updatedInventory) return null;
      const item = await MenuItemModel.findOne({ id: productId, storeId: tenantContext.storeId }).lean();
      return item ? this.cleanItem({ ...item, stockQuantity: updatedInventory.stockQuantity, active: updatedInventory.active }) : null;
    }
    if (isDBConnected()) {
      try {
        const updated = await MenuItemModel.findOneAndUpdate(
          {
            id: productId,
            active: { $ne: false },
            stockQuantity: { $gte: requestedQuantity }
          },
          {
            $inc: { stockQuantity: -requestedQuantity },
            $set: { updatedAt: new Date() }
          },
          { returnDocument: 'after' }
        ).lean();
        return updated ? this.cleanItem(updated) : null;
      } catch (err) {
        console.error('Error decrementing stock in MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    const item = items.find(i => i.id === productId);
    if (item && item.active !== false && item.stockQuantity >= requestedQuantity) {
      item.stockQuantity -= requestedQuantity;
      this.saveAll(items);
      return item;
    }
    return null;
  }

  async incrementStockAtomic(productId, quantity, tenantContext = null) {
    if (tenantContext?.branchId && isDBConnected()) {
      await branchInventoryRepository.incrementAtomic(tenantContext, productId, quantity);
      return;
    }
    if (isDBConnected()) {
      try {
        await MenuItemModel.findOneAndUpdate(
          { id: productId },
          { $inc: { stockQuantity: quantity }, $set: { updatedAt: new Date() } }
        );
      } catch (err) {
        console.error('Error incrementing stock rollback in MongoDB:', err.message);
      }
      return;
    }
    const items = this.getFromFile();
    const item = items.find(i => i.id === productId);
    if (item) {
      item.stockQuantity += quantity;
      this.saveAll(items);
    }
  }

  async resetAndSeed() {
    const defaultItems = this.getFromFile();
    if (isDBConnected()) {
      try {
        await MenuItemModel.deleteMany({});
        if (defaultItems.length > 0) {
          console.log('🌱 Re-seeding clean menu items to MongoDB...');
          await MenuItemModel.insertMany(defaultItems);
        }
      } catch (err) {
        console.error('Error resetting menu items in MongoDB:', err.message);
        throw err;
      }
    } else {
      this.saveAll(defaultItems);
    }
    return defaultItems;
  }
}

module.exports = new MenuRepository();

