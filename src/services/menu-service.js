const menuRepository = require('../repositories/menu-repository');

class MenuService {
  async getMenu() {
    return await menuRepository.getAll();
  }

  async getMenuItem(id) {
    return await menuRepository.getById(id);
  }

  async saveMenuItem(itemData) {
    if (!itemData || !itemData.id || typeof itemData.id !== 'string' || !itemData.id.trim()) {
      throw new Error('Mã món (ID) không được để trống');
    }
    if (!itemData.name || typeof itemData.name !== 'string' || !itemData.name.trim()) {
      throw new Error('Tên món ăn không được để trống');
    }
    if (typeof itemData.price !== 'number' || isNaN(itemData.price) || itemData.price < 0) {
      throw new Error('Giá bán không hợp lệ (phải là số lớn hơn hoặc bằng 0)');
    }
    return await menuRepository.saveOrUpdate({
      ...itemData,
      id: itemData.id.trim(),
      name: itemData.name.trim(),
      price: itemData.price,
      category: itemData.category || 'Món chính',
      image: itemData.image ? itemData.image.trim() : '',
      description: itemData.description ? itemData.description.trim() : '',
      active: itemData.active !== undefined ? Boolean(itemData.active) : true
    });
  }

  async toggleItemActive(id, activeState) {
    const updated = await menuRepository.toggleActive(id, activeState);
    if (!updated) {
      throw new Error(`Không tìm thấy món ăn với mã ${id}`);
    }
    return updated;
  }
}

module.exports = new MenuService();
