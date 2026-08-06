const fs = require('fs');
const path = require('path');

const MENU_FILE = path.join(__dirname, '..', 'data', 'menu.json');

class MenuRepository {
  getAll() {
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

  getById(id) {
    const items = this.getAll();
    return items.find(i => i.id === id);
  }

  saveAll(items) {
    fs.mkdirSync(path.dirname(MENU_FILE), { recursive: true });
    fs.writeFileSync(MENU_FILE, JSON.stringify(items, null, 2), 'utf8');
    return items;
  }

  saveOrUpdate(itemData) {
    const items = this.getAll();
    const index = items.findIndex(i => i.id === itemData.id);
    if (index >= 0) {
      items[index] = { ...items[index], ...itemData };
    } else {
      items.push(itemData);
    }
    this.saveAll(items);
    return itemData;
  }

  toggleActive(id, activeState) {
    const items = this.getAll();
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
