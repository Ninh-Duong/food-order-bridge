const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const { MenuItemModel } = require('../models');

const MENU_FILE = path.join(__dirname, '..', 'data', 'menu.json');

class MenuRepository {
  cleanItem(item) {
    if (!item) return null;
    const { _id, __v, ...rest } = item;
    const id = rest.id || _id;

    // Legacy fallback seed:
    // If stockQuantity is missing/undefined in item object, seed with 20.
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
      stockQuantity
    };
  }

  async getAll() {
    if (isDBConnected()) {
      try {
        let items = await MenuItemModel.find().lean();
        if (!items || items.length === 0) {
          const defaultItems = this.getFromFile();
          if (defaultItems.length > 0) {
            console.log('🌱 Seeding initial menu items to MongoDB...');
            await MenuItemModel.insertMany(defaultItems);
            items = await MenuItemModel.find().lean();
          }
        }
        return items.map(i => this.cleanItem(i));
      } catch (err) {
        console.error('Error fetching menu from MongoDB:', err.message);
        throw err;
      }
    }
    return this.getFromFile();
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

  async saveOrUpdate(itemData) {
    const cleanedData = this.cleanItem(itemData);
    if (isDBConnected()) {
      try {
        const updated = await MenuItemModel.findOneAndUpdate(
          { id: cleanedData.id },
          { $set: cleanedData },
          { upsert: true, new: true, runValidators: true }
        ).lean();
        return this.cleanItem(updated);
      } catch (err) {
        console.error('Error saving item to MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    const index = items.findIndex(i => i.id === cleanedData.id);
    if (index >= 0) {
      items[index] = { ...items[index], ...cleanedData };
    } else {
      items.push(cleanedData);
    }
    this.saveAll(items);
    return cleanedData;
  }

  async toggleActive(id, activeState) {
    if (isDBConnected()) {
      try {
        const updated = await MenuItemModel.findOneAndUpdate(
          { id },
          { $set: { active: activeState } },
          { new: true }
        ).lean();
        if (updated) return this.cleanItem(updated);
        return null;
      } catch (err) {
        console.error('Error toggling item status in MongoDB:', err.message);
        throw err;
      }
    }
    const items = this.getFromFile();
    const item = items.find(i => i.id === id);
    if (item) {
      item.active = activeState;
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

  async updateCategorySnapshot(categoryId, categoryName) {
    if (!categoryId || !categoryName) return;
    const upperId = categoryId.trim().toUpperCase();
    const cleanName = categoryName.trim();

    if (isDBConnected()) {
      try {
        await MenuItemModel.updateMany(
          { categoryId: upperId },
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
      if ((item.categoryId || '').toUpperCase() === upperId) {
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
  async decrementStockInTransaction(productId, requestedQuantity, session) {
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
        new: true,
        session
      }
    ).lean();

    return updated ? this.cleanItem(updated) : null;
  }
}

module.exports = new MenuRepository();
