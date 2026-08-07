const categoryRepository = require('../repositories/category-repository');
const menuRepository = require('../repositories/menu-repository');

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
    .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
    .replace(/ì|í|ị|ỉ|ĩ/g, 'i')
    .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
    .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
    .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A')
    .replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E')
    .replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I')
    .replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O')
    .replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U')
    .replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y')
    .replace(/Đ/g, 'D');
}

function generateSlug(name) {
  const plain = removeVietnameseTones(name);
  return plain
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeName(name) {
  return (name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

class CategoryService {
  async getCategories() {
    const categories = await categoryRepository.getAll();
    const categoriesWithCount = await Promise.all(
      categories.map(async cat => {
        const itemCount = await menuRepository.countByCategoryId(cat.id);
        return { ...cat, itemCount };
      })
    );
    return categoriesWithCount;
  }

  async getCategory(id) {
    if (!id) return null;
    const cat = await categoryRepository.getById(id);
    if (!cat) return null;
    const itemCount = await menuRepository.countByCategoryId(cat.id);
    return { ...cat, itemCount };
  }

  async createCategory(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Dữ liệu danh mục không hợp lệ');
    }

    const rawId = payload.id;
    if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
      throw new Error('Mã danh mục (ID) không được để trống');
    }
    const id = rawId.trim().toUpperCase();
    if (id.length < 2 || id.length > 40) {
      throw new Error('Mã danh mục (ID) phải từ 2 đến 40 ký tự');
    }
    if (!/^[A-Z0-9_]+$/.test(id)) {
      throw new Error('Mã danh mục chỉ được chứa chữ cái Latin, số và dấu gạch dưới (_)');
    }

    const rawName = payload.name;
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      throw new Error('Tên danh mục không được để trống');
    }
    const name = rawName.trim();
    if (name.length < 1 || name.length > 80) {
      throw new Error('Tên danh mục phải từ 1 đến 80 ký tự');
    }

    const description = payload.description ? String(payload.description).trim() : '';
    if (description.length > 300) {
      throw new Error('Mô tả danh mục không được vượt quá 300 ký tự');
    }

    let sortOrder = 0;
    if (payload.sortOrder !== undefined && payload.sortOrder !== null) {
      const parsedOrder = Number(payload.sortOrder);
      if (!Number.isInteger(parsedOrder) || parsedOrder < 0) {
        throw new Error('Thứ tự hiển thị phải là số nguyên không âm');
      }
      sortOrder = parsedOrder;
    }

    const active = payload.active !== undefined ? Boolean(payload.active) : true;

    // Check duplicate ID
    const existingId = await categoryRepository.getById(id);
    if (existingId) {
      throw new Error(`Mã danh mục "${id}" đã tồn tại`);
    }

    // Check duplicate normalized name
    const normName = normalizeName(name);
    const existingName = await categoryRepository.findByNormalizedName(normName);
    if (existingName) {
      throw new Error(`Tên danh mục "${name}" đã tồn tại`);
    }

    // Generate slug
    let slug = generateSlug(name);
    const existingSlug = await categoryRepository.getBySlug(slug);
    if (existingSlug) {
      slug = `${slug}-${id.toLowerCase()}`;
    }

    const created = await categoryRepository.create({
      id,
      name,
      slug,
      description,
      sortOrder,
      active
    });

    const itemCount = await menuRepository.countByCategoryId(created.id);
    return { ...created, itemCount };
  }

  async updateCategory(id, payload = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Mã danh mục không hợp lệ');
    }
    const upperId = id.trim().toUpperCase();
    const existing = await categoryRepository.getById(upperId);
    if (!existing) {
      throw new Error(`Không tìm thấy danh mục với mã ${upperId}`);
    }

    const rawName = payload.name;
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      throw new Error('Tên danh mục không được để trống');
    }
    const name = rawName.trim();
    if (name.length < 1 || name.length > 80) {
      throw new Error('Tên danh mục phải từ 1 đến 80 ký tự');
    }

    const description = payload.description !== undefined ? String(payload.description).trim() : existing.description;
    if (description.length > 300) {
      throw new Error('Mô tả danh mục không được vượt quá 300 ký tự');
    }

    let sortOrder = existing.sortOrder;
    if (payload.sortOrder !== undefined && payload.sortOrder !== null) {
      const parsedOrder = Number(payload.sortOrder);
      if (!Number.isInteger(parsedOrder) || parsedOrder < 0) {
        throw new Error('Thứ tự hiển thị phải là số nguyên không âm');
      }
      sortOrder = parsedOrder;
    }

    const active = payload.active !== undefined ? Boolean(payload.active) : existing.active;

    // Check duplicate normalized name (if name changed)
    const newNormName = normalizeName(name);
    const oldNormName = normalizeName(existing.name);
    if (newNormName !== oldNormName) {
      const existingName = await categoryRepository.findByNormalizedName(newNormName);
      if (existingName && existingName.id !== upperId) {
        throw new Error(`Tên danh mục "${name}" đã tồn tại`);
      }
    }

    let slug = generateSlug(name);
    const existingSlug = await categoryRepository.getBySlug(slug);
    if (existingSlug && existingSlug.id !== upperId) {
      slug = `${slug}-${upperId.toLowerCase()}`;
    }

    const updated = await categoryRepository.update(upperId, {
      name,
      slug,
      description,
      sortOrder,
      active
    });

    // Sync menu items snapshot if name changed
    if (name !== existing.name) {
      await menuRepository.updateCategorySnapshot(upperId, name);
    }

    const itemCount = await menuRepository.countByCategoryId(upperId);
    return { ...updated, itemCount };
  }

  async toggleCategoryActive(id, activeState) {
    if (!id || typeof id !== 'string') {
      throw new Error('Mã danh mục không hợp lệ');
    }
    const upperId = id.trim().toUpperCase();
    const existing = await categoryRepository.getById(upperId);
    if (!existing) {
      throw new Error(`Không tìm thấy danh mục với mã ${upperId}`);
    }

    const updated = await categoryRepository.toggleActive(upperId, Boolean(activeState));
    const itemCount = await menuRepository.countByCategoryId(upperId);
    return { ...updated, itemCount };
  }
}

module.exports = new CategoryService();
