/**
 * Food Order Bridge - Admin Category Management Module
 */
import { API } from '../common/api.js';
import { showToast, escapeHTML } from '../common/utils.js';
import { renderSkeletonTable } from '../common/ui-state.js';

let adminCategories = [];

export async function initCategoryManager() {
  await fetchCategories();

  const addBtn = document.getElementById('btn-open-add-category');
  if (addBtn) {
    addBtn.addEventListener('click', () => openCategoryModal());
  }
}

export async function fetchCategories() {
  const tableBody = document.getElementById('admin-category-table-body');
  if (!tableBody) return [];

  renderSkeletonTable(tableBody, 4, 6);

  try {
    const data = await API.get('/api/categories');
    adminCategories = data.categories || [];
    renderCategoryTable(adminCategories);
    return adminCategories;
  } catch (error) {
    showToast('Lỗi tải danh sách danh mục', 'error');
    return [];
  }
}

export function getLoadedCategories() {
  return adminCategories;
}

function renderCategoryTable(categories) {
  const tableBody = document.getElementById('admin-category-table-body');
  if (!tableBody) return;

  window.openCategoryModal = openCategoryModal;
  window.toggleCategoryActive = async (catId, activeState) => {
    const category = adminCategories.find(c => c.id === catId);
    if (!category) return;

    if (!activeState && category.itemCount > 0) {
      const confirmMsg = `Danh mục "${category.name}" hiện có ${category.itemCount} món. Khi tắt, các món này sẽ không hiển thị trên trang bán hàng. Bạn có muốn tiếp tục?`;
      if (!window.confirm(confirmMsg)) {
        await fetchCategories(); // Reset checkbox state
        return;
      }
    }

    try {
      await API.put(`/api/categories/${catId}/status`, { active: activeState });
      showToast(activeState ? 'Đã bật hiển thị danh mục' : 'Đã tắt hiển thị danh mục', 'success');
      await fetchCategories();
      // Notify item manager if category state changed
      document.dispatchEvent(new CustomEvent('categoriesUpdated'));
    } catch (error) {
      showToast(error.message || 'Lỗi cập nhật trạng thái danh mục', 'error');
      await fetchCategories();
    }
  };

  if (categories.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted);">Chưa có danh mục nào.</td></tr>`;
    return;
  }

  tableBody.innerHTML = categories.map(cat => {
    const safeId = escapeHTML(cat.id);
    const safeName = escapeHTML(cat.name);
    const safeDesc = escapeHTML(cat.description);

    return `
      <tr>
        <td><strong>${cat.sortOrder ?? 0}</strong></td>
        <td><code>${safeId}</code></td>
        <td>
          <strong>${safeName}</strong>
          ${safeDesc ? `<div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${safeDesc}</div>` : ''}
        </td>
        <td><span class="badge" style="background: rgba(0,0,0,0.05); color: var(--color-text-main);">${cat.itemCount ?? 0} món</span></td>
        <td>
          <label class="switch" title="Bật/Tắt hiển thị danh mục">
            <input type="checkbox" ${cat.active !== false ? 'checked' : ''} onchange="window.toggleCategoryActive('${safeId}', this.checked)" />
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-outline" style="min-height: 32px; padding: 4px 12px;" onclick="window.openCategoryModal('${safeId}')">Sửa</button>
        </td>
      </tr>
    `;
  }).join('');
}

function openCategoryModal(catId = null) {
  const modalOverlay = document.getElementById('admin-modal-overlay');
  const modalContent = document.getElementById('admin-modal-content');

  if (!modalOverlay || !modalContent) return;

  const category = catId ? adminCategories.find(c => c.id === catId) : null;

  modalContent.innerHTML = `
    <h3 style="font-size: var(--font-size-xl); font-weight: 800; margin-bottom: var(--space-4);">
      ${category ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
    </h3>
    <form id="admin-category-form">
      <div class="form-group">
        <label class="form-label" for="category-id-input">Mã danh mục (ID) *</label>
        <input type="text" id="category-id-input" class="form-control" value="${category ? escapeHTML(category.id) : ''}" ${category ? 'disabled' : 'required'} placeholder="VD: COM, NUOC, CANH" />
        <small style="font-size: var(--font-size-xs); color: var(--color-text-muted);">Viết hoa, chỉ gồm chữ cái, số và dấu _</small>
      </div>

      <div class="form-group">
        <label class="form-label" for="category-name-input">Tên danh mục *</label>
        <input type="text" id="category-name-input" class="form-control" value="${category ? escapeHTML(category.name) : ''}" required placeholder="VD: Cơm" />
      </div>

      <div class="form-group">
        <label class="form-label" for="category-desc-input">Mô tả</label>
        <textarea id="category-desc-input" class="form-control" rows="2" placeholder="VD: Các món cơm nóng hổi">${category ? escapeHTML(category.description || '') : ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label" for="category-order-input">Thứ tự hiển thị *</label>
        <input type="number" id="category-order-input" class="form-control" value="${category ? (category.sortOrder ?? 0) : 10}" required min="0" step="1" />
      </div>

      <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
        <label class="switch">
          <input type="checkbox" id="category-active-input" ${category && category.active === false ? '' : 'checked'} />
          <span class="slider"></span>
        </label>
        <label for="category-active-input" style="font-weight: 600; cursor: pointer;">Hiển thị danh mục</label>
      </div>

      <div style="display: flex; gap: var(--space-3); margin-top: var(--space-6);">
        <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('admin-modal-overlay').classList.remove('active')">Hủy</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-category" style="flex: 1;">Lưu danh mục</button>
      </div>
    </form>
  `;

  modalOverlay.classList.add('active');

  const form = document.getElementById('admin-category-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-category');
      if (submitBtn) submitBtn.disabled = true;

      const rawId = category ? category.id : document.getElementById('category-id-input').value.trim().toUpperCase();
      const rawName = document.getElementById('category-name-input').value.trim();
      const rawDesc = document.getElementById('category-desc-input').value.trim();
      const rawOrder = parseInt(document.getElementById('category-order-input').value, 10);
      const isActive = document.getElementById('category-active-input').checked;

      if (!rawId) {
        showToast('Vui lòng nhập Mã danh mục (ID)', 'error');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      if (!rawName) {
        showToast('Vui lòng nhập Tên danh mục', 'error');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      if (isNaN(rawOrder) || rawOrder < 0) {
        showToast('Thứ tự hiển thị phải là số nguyên không âm', 'error');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const payload = {
        id: rawId,
        name: rawName,
        description: rawDesc,
        sortOrder: rawOrder,
        active: isActive
      };

      try {
        if (category) {
          await API.put(`/api/categories/${category.id}`, payload);
          showToast('Cập nhật danh mục thành công!', 'success');
        } else {
          await API.post('/api/categories', payload);
          showToast('Tạo danh mục mới thành công!', 'success');
        }

        modalOverlay.classList.remove('active');
        await fetchCategories();
        document.dispatchEvent(new CustomEvent('categoriesUpdated'));
      } catch (err) {
        showToast(err.message || 'Lỗi lưu thông tin danh mục', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    };
  }
}
