const menuRepository = require('../repositories/menu-repository');
const categoryRepository = require('../repositories/category-repository');

class MenuService {
  async getMenu() {
    return await menuRepository.getAll();
  }

  async getMenuItem(id) {
    return await menuRepository.getById(id);
  }

  async saveMenuItem(itemData = {}) {
    if (!itemData || !itemData.id || typeof itemData.id !== 'string' || !itemData.id.trim()) {
      throw new Error('Mã món (ID) không được để trống');
    }
    if (!itemData.name || typeof itemData.name !== 'string' || !itemData.name.trim()) {
      throw new Error('Tên món ăn không được để trống');
    }
    if (typeof itemData.price !== 'number' || isNaN(itemData.price) || itemData.price < 0) {
      throw new Error('Giá bán không hợp lệ (phải là số lớn hơn hoặc bằng 0)');
    }

    const itemId = itemData.id.trim().toUpperCase();

    // Check categoryId requirement
    let categoryId = itemData.categoryId;
    if (!categoryId || typeof categoryId !== 'string' || !categoryId.trim()) {
      // Fallback check if category string matches existing category id or name (for legacy inputs)
      if (itemData.category && typeof itemData.category === 'string') {
        const catByName = await categoryRepository.findByNormalizedName(itemData.category.trim().toLowerCase());
        if (catByName) {
          categoryId = catByName.id;
        }
      }
    }

    if (!categoryId || !String(categoryId).trim()) {
      throw new Error('Vui lòng chọn danh mục cho món ăn');
    }

    const upperCatId = String(categoryId).trim().toUpperCase();
    const categoryObj = await categoryRepository.getById(upperCatId);
    if (!categoryObj) {
      throw new Error(`Danh mục với mã "${upperCatId}" không tồn tại trong hệ thống`);
    }

    const existingItem = await menuRepository.getById(itemId);
    const isNewItem = !existingItem;

    if (isNewItem && categoryObj.active === false) {
      throw new Error(`Danh mục "${categoryObj.name}" đang bị tắt. Vui lòng chọn hoặc bật danh mục trước khi tạo món mới.`);
    }

    return await menuRepository.saveOrUpdate({
      ...itemData,
      id: itemId,
      name: itemData.name.trim(),
      price: itemData.price,
      categoryId: categoryObj.id,
      category: categoryObj.name, // Server-assigned snapshot
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
