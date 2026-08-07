/**
 * Food Order Bridge - Admin Food Item Management (CRUD & Active Toggle Flag)
 */
import { API } from '../common/api.js';
import { formatVND, showToast } from '../common/utils.js';

let adminMenuItems = [];

export async function initItemManager() {
  await fetchAdminMenu();

  const addBtn = document.getElementById('btn-open-add-item');
  if (addBtn) {
    addBtn.addEventListener('click', () => openItemModal());
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
        <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'}" class="item-thumb" alt="${item.name}" />
      </td>
      <td>
        <strong>${item.name}</strong>
        <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${item.category || 'Món chính'}</div>
      </td>
      <td>${formatVND(item.price)}</td>
      <td>
        <label class="switch" title="Bật/Tắt bán hôm nay">
          <input type="checkbox" ${item.active !== false ? 'checked' : ''} onchange="window.toggleItemActive('${item.id}', this.checked)" />
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <span class="badge ${item.active !== false ? 'badge-active' : 'badge-inactive'}">
          ${item.active !== false ? 'Đang bán' : 'Tạm ngưng'}
        </span>
      </td>
      <td>
        <button class="btn btn-outline" style="min-height: 32px; padding: 4px 12px;" onclick="window.openItemModal('${item.id}')">Sửa</button>
      </td>
    </tr>
  `).join('');
}

function openItemModal(itemId = null) {
  const modalOverlay = document.getElementById('admin-modal-overlay');
  const modalContent = document.getElementById('admin-modal-content');

  if (!modalOverlay || !modalContent) return;

  const item = itemId ? adminMenuItems.find(i => i.id === itemId) : null;

  modalContent.innerHTML = `
    <h3 style="font-size: var(--font-size-xl); font-weight: 800; margin-bottom: var(--space-4);">
      ${item ? 'Chỉnh sửa món ăn' : 'Thêm món ăn mới'}
    </h3>
    <form id="admin-item-form">
      <div class="form-group">
        <label class="form-label" for="item-id-input">Mã món (ID) *</label>
        <input type="text" id="item-id-input" class="form-control" value="${item ? item.id : ''}" ${item ? 'disabled' : 'required'} placeholder="VD: COM_GA" />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-name-input">Tên món ăn *</label>
        <input type="text" id="item-name-input" class="form-control" value="${item ? item.name : ''}" required placeholder="VD: Cơm gà sốt xối mỡ" />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-category-input">Danh mục *</label>
        <select id="item-category-input" class="form-control" required>
          <option value="Món chính" ${item && item.category === 'Món chính' ? 'selected' : ''}>Món chính</option>
          <option value="Món nước" ${item && item.category === 'Món nước' ? 'selected' : ''}>Món nước</option>
          <option value="Ăn kèm" ${item && item.category === 'Ăn kèm' ? 'selected' : ''}>Ăn kèm</option>
          <option value="Đồ uống" ${item && item.category === 'Đồ uống' ? 'selected' : ''}>Đồ uống</option>
          <option value="Tráng miệng" ${item && item.category === 'Tráng miệng' ? 'selected' : ''}>Tráng miệng</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="item-price-input">Giá bán (VND) *</label>
        <input type="number" id="item-price-input" class="form-control" value="${item ? item.price : ''}" required min="0" step="1000" placeholder="VD: 50000" />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-image-input">Link hình ảnh WebP/JPG</label>
        <input type="text" id="item-image-input" class="form-control" value="${item ? item.image || '' : ''}" placeholder="https://..." />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-desc-input">Mô tả thành phần</label>
        <textarea id="item-desc-input" class="form-control" rows="3" placeholder="Gà giòn rụm kèm nước sốt đặc biệt...">${item ? item.description || '' : ''}</textarea>
      </div>

      <div style="display: flex; gap: var(--space-3); margin-top: var(--space-6);">
        <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('admin-modal-overlay').classList.remove('active')">Hủy</button>
        <button type="submit" class="btn btn-primary" style="flex: 1;">Lưu món ăn</button>
      </div>
    </form>
  `;

  modalOverlay.classList.add('active');

  const form = document.getElementById('admin-item-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const rawPrice = document.getElementById('item-price-input').value;
      const parsedPrice = parseInt(rawPrice, 10);

      if (isNaN(parsedPrice) || parsedPrice < 0) {
        showToast('Giá bán phải là số nguyên dương hợp lệ', 'error');
        return;
      }

      const itemIdVal = item ? item.id : document.getElementById('item-id-input').value.trim().toUpperCase().replace(/\s+/g, '_');
      if (!itemIdVal) {
        showToast('Vui lòng nhập Mã món (ID)', 'error');
        return;
      }

      const payload = {
        id: itemIdVal,
        name: document.getElementById('item-name-input').value.trim(),
        category: document.getElementById('item-category-input').value,
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
      }
    };
  }
}
