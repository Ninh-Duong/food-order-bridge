const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const { MenuItemModel } = require('../models');

const MENU_FILE = path.join(__dirname, '..', 'data', 'menu.json');

class MenuRepository {
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
        return items.map(i => ({ ...i, id: i.id || i._id }));
      } catch (err) {
        console.error('Error fetching menu from MongoDB:', err.message);
      }
    }
    return this.getFromFile();
  }

  getFromFile() {
    try {
      if (fs.existsSync(MENU_FILE)) {
        const raw = fs.readFileSync(MENU_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error reading menu.json:', err.message);
    }
    return [];
  }

  async getById(id) {
    if (isDBConnected()) {
      try {
        const item = await MenuItemModel.findOne({ id }).lean();
        if (item) return { ...item, id: item.id || item._id };
      } catch (err) {
        console.error('Error fetching item by id from MongoDB:', err.message);
      }
    }
    const items = this.getFromFile();
    return items.find(i => i.id === id);
  }

  saveAll(items) {
    fs.mkdirSync(path.dirname(MENU_FILE), { recursive: true });
    fs.writeFileSync(MENU_FILE, JSON.stringify(items, null, 2), 'utf8');
    return items;
  }

  async saveOrUpdate(itemData) {
    if (isDBConnected()) {
      try {
        const updated = await MenuItemModel.findOneAndUpdate(
          { id: itemData.id },
          { $set: itemData },
          { upsert: true, new: true, runValidators: true }
        ).lean();
        return { ...updated, id: updated.id || updated._id };
      } catch (err) {
        console.error('Error saving item to MongoDB:', err.message);
      }
    }
    const items = this.getFromFile();
    const index = items.findIndex(i => i.id === itemData.id);
    if (index >= 0) {
      items[index] = { ...items[index], ...itemData };
    } else {
      items.push(itemData);
    }
    this.saveAll(items);
    return itemData;
  }

  async toggleActive(id, activeState) {
    if (isDBConnected()) {
      try {
        const updated = await MenuItemModel.findOneAndUpdate(
          { id },
          { $set: { active: activeState } },
          { new: true }
        ).lean();
        if (updated) return { ...updated, id: updated.id || updated._id };
      } catch (err) {
        console.error('Error toggling item status in MongoDB:', err.message);
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
}

module.exports = new MenuRepository();
