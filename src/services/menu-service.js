const menuRepository = require('../repositories/menu-repository');

class MenuService {
  getMenu() {
    return menuRepository.getAll();
  }

  getMenuItem(id) {
    return menuRepository.getById(id);
  }

  saveMenuItem(itemData) {
    if (!itemData.id || !itemData.name || typeof itemData.price !== 'number') {
      throw new Error('Dữ liệu món ăn không hợp lệ (cần ID, tên món, giá cả)');
    }
    return menuRepository.saveOrUpdate(itemData);
  }

  toggleItemActive(id, activeState) {
    const updated = menuRepository.toggleActive(id, activeState);
    if (!updated) {
      throw new Error(`Không tìm thấy món ăn với mã ${id}`);
    }
    return updated;
  }
}

module.exports = new MenuService();
