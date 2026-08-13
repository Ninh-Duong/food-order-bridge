const menuRepository = require('../repositories/menu-repository');
const categoryRepository = require('../repositories/category-repository');
const { calculateSalePrice } = require('../utils/price-calculator');

class MenuService {
  /**
   * Centralized Serialization for Menu Item Responses
   */
  serializeMenuItem(item) {
    if (!item) return null;
    const price = Number(item.price) || 0;
    const discountPercent = Number.isFinite(item.discountPercent) ? Math.max(0, Math.min(100, Number(item.discountPercent))) : 0;
    const stockQuantity = Number.isInteger(item.stockQuantity) && item.stockQuantity >= 0 ? item.stockQuantity : 0;
    const active = item.active !== false;

    const salePrice = calculateSalePrice(price, discountPercent);
    const available = active && stockQuantity > 0;

    const rawOptions = Array.isArray(item.customizationOptions) ? item.customizationOptions : [];
    const customizationOptions = rawOptions
      .map(opt => ({
        id: String(opt.id || '').trim().toUpperCase(),
        name: String(opt.name || '').trim(),
        defaultIncluded: opt.defaultIncluded !== false,
        active: opt.active !== false,
        sortOrder: Number.isInteger(opt.sortOrder) && opt.sortOrder >= 0 ? opt.sortOrder : 0
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'));

    return {
      ...item,
      price,
      discountPercent,
      salePrice,
      stockQuantity,
      customizationOptions,
      available,
      active
    };
  }

  async getMenu() {
    const rawItems = await menuRepository.getAll();
    return rawItems.map(i => this.serializeMenuItem(i));
  }

  async getMenuForTenant(tenantContext) {
    const rawItems = await menuRepository.getAllForTenant(tenantContext);
    return rawItems.map(i => this.serializeMenuItem(i));
  }

  async getMenuItem(id) {
    if (!id) return null;
    const rawItem = await menuRepository.getById(id);
    return this.serializeMenuItem(rawItem);
  }

  async saveMenuItem(itemData = {}, tenantContext = null) {
    if (!itemData || typeof itemData !== 'object') {
      throw new Error('Dữ liệu món ăn không hợp lệ');
    }
    if (!itemData.id || typeof itemData.id !== 'string' || !itemData.id.trim()) {
      throw new Error('Mã món (ID) không được để trống');
    }
    if (!itemData.name || typeof itemData.name !== 'string' || !itemData.name.trim()) {
      throw new Error('Tên món ăn không được để trống');
    }

    // Strict validation for price
    if (itemData.price === undefined || itemData.price === null || typeof itemData.price !== 'number' || !Number.isFinite(itemData.price) || itemData.price < 0) {
      throw new Error('Giá gốc không hợp lệ (phải là số lớn hơn hoặc bằng 0)');
    }

    // Strict validation for stockQuantity
    let stockQuantity = 0;
    if (itemData.stockQuantity !== undefined && itemData.stockQuantity !== null) {
      if (typeof itemData.stockQuantity !== 'number' || !Number.isInteger(itemData.stockQuantity) || itemData.stockQuantity < 0) {
        throw new Error('Số lượng tồn kho phải là số nguyên không âm');
      }
      stockQuantity = itemData.stockQuantity;
    }

    // Strict validation for discountPercent
    let discountPercent = 0;
    if (itemData.discountPercent !== undefined && itemData.discountPercent !== null) {
      if (typeof itemData.discountPercent !== 'number' || !Number.isFinite(itemData.discountPercent) || itemData.discountPercent < 0 || itemData.discountPercent > 100) {
        throw new Error('Phần trăm giảm giá phải là số từ 0 đến 100');
      }
      discountPercent = itemData.discountPercent;
    }

    const itemId = itemData.id.trim().toUpperCase();

    // Check categoryId requirement
    let categoryId = itemData.categoryId;
    if (!categoryId || typeof categoryId !== 'string' || !categoryId.trim()) {
      if (itemData.category && typeof itemData.category === 'string') {
        const catByName = tenantContext
          ? await categoryRepository.findByNormalizedNameForTenant(tenantContext, itemData.category.trim().toLowerCase())
          : await categoryRepository.findByNormalizedName(itemData.category.trim().toLowerCase());
        if (catByName) {
          categoryId = catByName.id;
        }
      }
    }

    if (!categoryId || !String(categoryId).trim()) {
      throw new Error('Vui lòng chọn danh mục cho món ăn');
    }

    const upperCatId = String(categoryId).trim().toUpperCase();
    const categoryObj = tenantContext
      ? await categoryRepository.getByIdForTenant(tenantContext, upperCatId)
      : await categoryRepository.getById(upperCatId);
    if (!categoryObj) {
      throw new Error(`Danh mục với mã "${upperCatId}" không tồn tại trong hệ thống`);
    }

    const existingItem = tenantContext
      ? await menuRepository.getByIdForTenant(tenantContext, itemId)
      : await menuRepository.getById(itemId);
    const isNewItem = !existingItem;

    if (isNewItem && categoryObj.active === false) {
      throw new Error(`Danh mục "${categoryObj.name}" đang bị tắt. Vui lòng chọn hoặc bật danh mục trước khi tạo món mới.`);
    }

    // Retain legacy stock quantity if creating/updating without passing stockQuantity explicitly for existing items
    if (existingItem && itemData.stockQuantity === undefined) {
      stockQuantity = existingItem.stockQuantity;
    }

    // Validation for customizationOptions
    let customizationOptions = [];
    if (itemData.customizationOptions !== undefined) {
      if (!Array.isArray(itemData.customizationOptions)) {
        throw new Error('Danh sách tùy chọn thành phần phải là một mảng');
      }
      if (itemData.customizationOptions.length > 20) {
        throw new Error('Món ăn chỉ được có tối đa 20 tùy chọn thành phần');
      }

      const seenIds = new Set();
      const seenNames = new Set();

      for (const opt of itemData.customizationOptions) {
        if (!opt || typeof opt !== 'object') {
          throw new Error('Tùy chọn thành phần không hợp lệ');
        }
        if (!opt.id || typeof opt.id !== 'string' || !opt.id.trim()) {
          throw new Error('Mã tùy chọn thành phần không được để trống');
        }
        const optId = opt.id.trim().toUpperCase();
        if (!/^[A-Z0-9_]{2,40}$/.test(optId)) {
          throw new Error(`Mã tùy chọn "${optId}" không hợp lệ (chỉ gồm chữ cái in hoa không dấu, số, dấu gạch dưới, từ 2 đến 40 ký tự)`);
        }
        if (seenIds.has(optId)) {
          throw new Error(`Mã tùy chọn "${optId}" bị trùng lặp trong cùng một món`);
        }
        seenIds.add(optId);

        if (!opt.name || typeof opt.name !== 'string' || !opt.name.trim()) {
          throw new Error('Tên thành phần không được để trống');
        }
        const optName = opt.name.trim();
        if (optName.length > 80) {
          throw new Error(`Tên thành phần "${optName}" vượt quá 80 ký tự`);
        }
        const normalizedName = optName.toLowerCase();
        if (seenNames.has(normalizedName)) {
          throw new Error(`Tên thành phần "${optName}" bị trùng lặp trong cùng một món`);
        }
        seenNames.add(normalizedName);

        const defaultIncluded = opt.defaultIncluded !== undefined ? Boolean(opt.defaultIncluded) : true;
        const active = opt.active !== undefined ? Boolean(opt.active) : true;
        
        let sortOrder = 0;
        if (opt.sortOrder !== undefined && opt.sortOrder !== null) {
          if (typeof opt.sortOrder !== 'number' || !Number.isInteger(opt.sortOrder) || opt.sortOrder < 0) {
            throw new Error('Thứ tự hiển thị tùy chọn thành phần phải là số nguyên không âm');
          }
          sortOrder = opt.sortOrder;
        }

        customizationOptions.push({
          id: optId,
          name: optName,
          defaultIncluded,
          active,
          sortOrder
        });
      }

      customizationOptions.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'));
    } else if (existingItem && Array.isArray(existingItem.customizationOptions)) {
      customizationOptions = existingItem.customizationOptions;
    }

    const saved = await menuRepository.saveOrUpdate({
      id: itemId,
      name: itemData.name.trim(),
      price: itemData.price,
      discountPercent,
      stockQuantity,
      customizationOptions,
      categoryId: categoryObj.id,
      category: categoryObj.name, // Server-assigned snapshot
      image: itemData.image ? String(itemData.image).trim() : '',
      description: itemData.description ? String(itemData.description).trim() : '',
      isBestseller: Boolean(itemData.isBestseller),
      isSpicy: Boolean(itemData.isSpicy),
      active: itemData.active !== undefined ? Boolean(itemData.active) : (existingItem ? existingItem.active : true),
      ...(tenantContext ? { storeId: tenantContext.storeId } : {})
    }, tenantContext);

    return this.serializeMenuItem(saved);
  }

  async toggleItemActive(id, activeState, tenantContext = null) {
    const updated = await menuRepository.toggleActive(id, activeState, tenantContext);
    if (!updated) {
      throw new Error(`Không tìm thấy món ăn với mã ${id}`);
    }
    return this.serializeMenuItem(updated);
  }
}

module.exports = new MenuService();
