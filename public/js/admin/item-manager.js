/**
 * Food Order Bridge - Admin Food Item Management (CRUD & Active Toggle Flag)
 */
import { API } from '../common/api.js';
import { formatVND, showToast, escapeHTML } from '../common/utils.js';

let adminMenuItems = [];
let availableCategories = [];

export async function initItemManager() {
  await Promise.all([
    fetchAdminMenu(),
    fetchCategories()
  ]);

  document.addEventListener('categoriesUpdated', async () => {
    await fetchCategories();
  });

  const addBtn = document.getElementById('btn-open-add-item');
  if (addBtn) {
    addBtn.addEventListener('click', () => openItemModal());
  }
}

async function fetchCategories() {
  try {
    const data = await API.get('/api/categories');
    availableCategories = data.categories || [];
  } catch (error) {
    console.error('Lỗi tải danh mục trong ItemManager:', error);
    availableCategories = [];
  }
}

async function fetchAdminMenu() {
  const tableBody = document.getElementById('admin-menu-table-body');
  if (!tableBody) return;

  try {
    const data = await API.get('/api/menu');
    adminMenuItems = data.items || [];
    renderMenuTable(adminMenuItems);
  } catch (error) {
    showToast('Lỗi tải danh sách món ăn', 'error');
  }
}

function renderMenuTable(items) {
  const tableBody = document.getElementById('admin-menu-table-body');
  if (!tableBody) return;

  window.openItemModal = openItemModal;
  window.toggleItemActive = async (itemId, activeState) => {
    try {
      await API.put(`/api/menu/${itemId}/status`, { active: activeState });
      showToast(activeState ? 'Đã bật bán món hôm nay' : 'Đã ngưng bán món hôm nay', 'success');
      await fetchAdminMenu();
    } catch (error) {
      showToast('Lỗi cập nhật trạng thái món', 'error');
    }
  };

  if (items.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted);">Chưa có món ăn nào.</td></tr>`;
    return;
  }

  tableBody.innerHTML = items.map(item => `
    <tr>
      <td>
        <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'}" class="item-thumb" alt="${escapeHTML(item.name)}" />
      </td>
      <td>
        <strong>${escapeHTML(item.name)}</strong>
        <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${escapeHTML(item.category || 'Món chính')}</div>
      </td>
      <td>${formatVND(item.price)}</td>
      <td>
        <label class="switch" title="Bật/Tắt bán hôm nay">
          <input type="checkbox" ${item.active !== false ? 'checked' : ''} onchange="window.toggleItemActive('${escapeHTML(item.id)}', this.checked)" />
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <span class="badge ${item.active !== false ? 'badge-active' : 'badge-inactive'}">
          ${item.active !== false ? 'Đang bán' : 'Tạm ngưng'}
        </span>
      </td>
      <td>
        <button class="btn btn-outline" style="min-height: 32px; padding: 4px 12px;" onclick="window.openItemModal('${escapeHTML(item.id)}')">Sửa</button>
      </td>
    </tr>
  `).join('');
}

async function openItemModal(itemId = null) {
  const modalOverlay = document.getElementById('admin-modal-overlay');
  const modalContent = document.getElementById('admin-modal-content');

  if (!modalOverlay || !modalContent) return;

  await fetchCategories();

  const item = itemId ? adminMenuItems.find(i => i.id === itemId) : null;
  const currentCatId = item ? item.categoryId : null;

  // Filter selectable categories:
  // For new item: only active categories
  // For existing item: active categories + current item's category (even if inactive, marked as "(Đã tắt)")
  const optionsHtml = availableCategories
    .filter(cat => cat.active !== false || cat.id === currentCatId)
    .map(cat => {
      const isSelected = (currentCatId && cat.id === currentCatId) || (!currentCatId && item && item.category === cat.name);
      const isInactive = cat.active === false;
      const label = `${escapeHTML(cat.name)}${isInactive ? ' (Đã tắt)' : ''}`;
      return `<option value="${escapeHTML(cat.id)}" ${isSelected ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  const activeCategoriesExist = availableCategories.some(cat => cat.active !== false);
  const canSave = item ? true : activeCategoriesExist;

  modalContent.innerHTML = `
    <h3 style="font-size: var(--font-size-xl); font-weight: 800; margin-bottom: var(--space-4);">
      ${item ? 'Chỉnh sửa món ăn' : 'Thêm món ăn mới'}
    </h3>
    <form id="admin-item-form">
      <div class="form-group">
        <label class="form-label" for="item-id-input">Mã món (ID) *</label>
        <input type="text" id="item-id-input" class="form-control" value="${item ? escapeHTML(item.id) : ''}" ${item ? 'disabled' : 'required'} placeholder="VD: COM_GA" />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-name-input">Tên món ăn *</label>
        <input type="text" id="item-name-input" class="form-control" value="${item ? escapeHTML(item.name) : ''}" required placeholder="VD: Cơm gà sốt xối mỡ" />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-category-input">Danh mục *</label>
        ${optionsHtml ? `
          <select id="item-category-input" class="form-control" required>
            ${optionsHtml}
          </select>
        ` : `
          <div style="color: var(--color-accent-spicy); font-size: var(--font-size-sm); margin-top: 4px;">
            ⚠️ Chưa có danh mục nào đang hoạt động. Vui lòng sang tab "Quản lý Danh mục" để tạo hoặc bật danh mục trước.
          </div>
        `}
      </div>

      <div class="form-group">
        <label class="form-label" for="item-price-input">Giá bán (VND) *</label>
        <input type="number" id="item-price-input" class="form-control" value="${item ? item.price : ''}" required min="0" step="1000" placeholder="VD: 50000" />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-image-input">Link hình ảnh WebP/JPG</label>
        <input type="text" id="item-image-input" class="form-control" value="${item ? escapeHTML(item.image || '') : ''}" placeholder="https://..." />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-desc-input">Mô tả thành phần</label>
        <textarea id="item-desc-input" class="form-control" rows="3" placeholder="Gà giòn rụm kèm nước sốt đặc biệt...">${item ? escapeHTML(item.description || '') : ''}</textarea>
      </div>

      <div style="display: flex; gap: var(--space-3); margin-top: var(--space-6);">
        <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('admin-modal-overlay').classList.remove('active')">Hủy</button>
        <button type="submit" class="btn btn-primary" id="btn-save-item" style="flex: 1;" ${!canSave ? 'disabled' : ''}>Lưu món ăn</button>
      </div>
    </form>
  `;

  modalOverlay.classList.add('active');

  const form = document.getElementById('admin-item-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-item');
      if (saveBtn) saveBtn.disabled = true;

      const rawPrice = document.getElementById('item-price-input').value;
      const parsedPrice = parseInt(rawPrice, 10);

      if (isNaN(parsedPrice) || parsedPrice < 0) {
        showToast('Giá bán phải là số nguyên dương hợp lệ', 'error');
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const itemIdVal = item ? item.id : document.getElementById('item-id-input').value.trim().toUpperCase().replace(/\s+/g, '_');
      if (!itemIdVal) {
        showToast('Vui lòng nhập Mã món (ID)', 'error');
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const catSelect = document.getElementById('item-category-input');
      if (!catSelect || !catSelect.value) {
        showToast('Vui lòng chọn danh mục hợp lệ', 'error');
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const payload = {
        id: itemIdVal,
        name: document.getElementById('item-name-input').value.trim(),
        categoryId: catSelect.value,
        price: parsedPrice,
        image: document.getElementById('item-image-input').value.trim(),
        description: document.getElementById('item-desc-input').value.trim(),
        active: item ? item.active : true
      };

      try {
        await API.post('/api/menu', payload);
        showToast('Lưu thông tin món thành công!', 'success');
        modalOverlay.classList.remove('active');
        await fetchAdminMenu();
      } catch (err) {
        showToast(err.message || 'Lỗi lưu thông tin món', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };
  }
}
