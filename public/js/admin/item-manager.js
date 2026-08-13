/**
 * Food Order Bridge - Admin Food Item Management (CRUD, Stock, Discount & Customization Options)
 */
import { API } from '../common/api.js';
import { formatVND, showToast, escapeHTML } from '../common/utils.js';
import { renderSkeletonTable } from '../common/ui-state.js';

let adminMenuItems = [];
let availableCategories = [];
let initialCatalog = null;
let initialMenuLoaded = false;
let initialCategoriesLoaded = false;
let canCatalogWrite = false;

function calculateSalePriceClient(price, discountPercent = 0) {
  const numPrice = Number(price) || 0;
  const numDiscount = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  return Math.round(numPrice * (100 - numDiscount) / 100);
}

function slugifyOptionId(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 40);
}

export async function initItemManager(workspace = window.__POS_WORKSPACE__) {
  initialCatalog = workspace?.catalog || null;
  canCatalogWrite = workspace?.permissions?.includes('catalog.write') || false;
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

  const resetBtn = document.getElementById('btn-reset-data');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const confirmReset = confirm('Bạn có chắc chắn muốn khôi phục toàn bộ Thực đơn & Danh mục về bộ dữ liệu mẫu chuẩn không?\n\n(Lưu ý: Các món ăn/danh mục thử nghiệm không chuẩn sẽ bị xóa)');
      if (!confirmReset) return;

      const clearOrders = confirm('Bạn có muốn xóa luôn lịch sử Đơn hàng thử nghiệm hiện tại không?');

      try {
        const res = await API.post('/api/admin/reset-data', { clearOrders });
        showToast(res.message || 'Đã reset dữ liệu thành công!', 'success');
        await Promise.all([
          fetchAdminMenu(),
          fetchCategories()
        ]);
        document.dispatchEvent(new CustomEvent('categoriesUpdated'));
      } catch (err) {
        showToast(err.message || 'Lỗi khi reset dữ liệu', 'error');
      }
    });
  }
}


async function fetchCategories() {
  if (!initialCategoriesLoaded && initialCatalog?.categories) {
    availableCategories = initialCatalog.categories;
    initialCategoriesLoaded = true;
    return;
  }
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

  renderSkeletonTable(tableBody, 5, 7);

  try {
    if (!initialMenuLoaded && initialCatalog?.menuItems) {
      adminMenuItems = initialCatalog.menuItems;
      initialMenuLoaded = true;
      renderMenuTable(adminMenuItems);
      return;
    }
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
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">Chưa có món ăn nào.</td></tr>`;
    return;
  }

  tableBody.innerHTML = items.map(item => {
    const isDiscounted = item.discountPercent > 0;
    const salePrice = item.salePrice !== undefined ? item.salePrice : calculateSalePriceClient(item.price, item.discountPercent);
    const stock = item.stockQuantity ?? 0;
    const isActive = item.active !== false;

    let stockBadgeHtml = '';
    if (stock > 5) {
      stockBadgeHtml = `<span class="badge badge-active" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">Còn ${stock}</span>`;
    } else if (stock > 0) {
      stockBadgeHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">Sắp hết: ${stock}</span>`;
    } else {
      stockBadgeHtml = `<span class="badge badge-inactive" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">Hết hàng</span>`;
    }

    let statusText = 'Đang bán';
    let statusClass = 'badge-active';
    if (!isActive) {
      statusText = 'Tạm ngưng';
      statusClass = 'badge-inactive';
    } else if (stock === 0) {
      statusText = 'Hết hàng';
      statusClass = 'badge-inactive';
    }

    const customOptions = Array.isArray(item.customizationOptions) ? item.customizationOptions : [];
    const customCount = customOptions.length;

    return `
      <tr>
        <td data-label="Hình ảnh">
          <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'}" class="item-thumb" alt="${escapeHTML(item.name)}" />
        </td>
        <td data-label="Món ăn">
          <strong>${escapeHTML(item.name)}</strong>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${escapeHTML(item.category || 'Món chính')}</div>
          ${customCount > 0 ? `<div style="font-size: 11px; color: var(--color-primary); margin-top: 2px;">⚙️ ${customCount} tùy chọn thành phần</div>` : ''}
        </td>
        <td data-label="Giá bán">
          ${isDiscounted ? `
            <div style="font-size: var(--font-size-xs); text-decoration: line-through; color: var(--color-text-muted);">${formatVND(item.price)}</div>
            <strong style="color: var(--color-accent-spicy); font-size: var(--font-size-sm);">${formatVND(salePrice)}</strong>
            <span style="font-size: 10px; background: rgba(225, 29, 72, 0.1); color: var(--color-accent-spicy); padding: 1px 4px; border-radius: 4px; font-weight: 700; margin-left: 4px;">-${item.discountPercent}%</span>
          ` : `
            <strong>${formatVND(item.price)}</strong>
          `}
        </td>
        <td data-label="Tồn kho">${stockBadgeHtml}</td>
        <td data-label="Bán hôm nay">
          ${canCatalogWrite ? `<label class="switch" title="Bật/Tắt bán hôm nay">
            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.toggleItemActive('${escapeHTML(item.id)}', this.checked)" />
            <span class="slider"></span>
          </label>` : '<span style="color:var(--color-text-muted);">Chỉ xem</span>'}
        </td>
        <td data-label="Trạng thái">
          <span class="badge ${statusClass}">${statusText}</span>
        </td>
        <td data-label="Thao tác">
          ${canCatalogWrite ? `<button class="btn btn-outline" style="min-height: 32px; padding: 4px 12px;" onclick="window.openItemModal('${escapeHTML(item.id)}')">Sửa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function openItemModal(itemId = null) {
  const modalOverlay = document.getElementById('admin-modal-overlay');
  const modalContent = document.getElementById('admin-modal-content');

  if (!modalOverlay || !modalContent) return;

  await fetchCategories();

  const item = itemId ? adminMenuItems.find(i => i.id === itemId) : null;
  const currentCatId = item ? item.categoryId : null;

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

  const initialPrice = item ? item.price : 50000;
  const initialDiscount = item ? (item.discountPercent || 0) : 0;
  const initialStock = item ? (item.stockQuantity ?? 20) : 20;

  // Local mutable copy of customizationOptions
  let currentCustomOptions = item && Array.isArray(item.customizationOptions)
    ? JSON.parse(JSON.stringify(item.customizationOptions))
    : [];

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

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
        <div class="form-group">
          <label class="form-label" for="item-price-input">Giá gốc (VND) *</label>
          <input type="number" id="item-price-input" class="form-control" value="${initialPrice}" required min="0" step="1000" placeholder="VD: 100000" />
        </div>

        <div class="form-group">
          <label class="form-label" for="item-discount-input">Khuyến mãi (%) *</label>
          <input type="number" id="item-discount-input" class="form-control" value="${initialDiscount}" required min="0" max="100" step="1" placeholder="VD: 20" />
        </div>
      </div>

      <div id="price-preview-box" style="background: var(--color-bg-alt); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-4); font-size: var(--font-size-sm);">
      </div>

      <div class="form-group">
        <label class="form-label" for="item-stock-input">Số lượng tồn kho *</label>
        <input type="number" id="item-stock-input" class="form-control" value="${initialStock}" required min="0" step="1" placeholder="VD: 15" />
      </div>

      <!-- Customization Options Section -->
      <div class="form-group" style="background: var(--color-bg-alt); padding: var(--space-4); border-radius: var(--radius-lg); border: 1px solid var(--color-border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label class="form-label" style="margin: 0; font-weight: 800; font-size: var(--font-size-md);">⚙️ Tùy chọn thành phần</label>
          <button type="button" class="btn btn-secondary" id="btn-add-custom-opt" style="min-height: 32px; padding: 2px 10px; font-size: 12px;">
            + Thêm thành phần
          </button>
        </div>
        <p style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 12px;">
          Khách hàng có thể bỏ chọn những thành phần này khi đặt món (VD: Hành phi, Tỏi phi, Nước tương).
        </p>

        <div id="custom-options-list">
          <!-- Rendered dynamically -->
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="item-image-input">Link hình ảnh WebP/JPG</label>
        <input type="text" id="item-image-input" class="form-control" value="${item ? escapeHTML(item.image || '') : ''}" placeholder="https://..." />
      </div>

      <div class="form-group">
        <label class="form-label" for="item-desc-input">Mô tả món ăn</label>
        <textarea id="item-desc-input" class="form-control" rows="2" placeholder="Gà giòn rụm kèm nước sốt đặc biệt...">${item ? escapeHTML(item.description || '') : ''}</textarea>
      </div>

      <div style="display: flex; gap: var(--space-3); margin-top: var(--space-6);">
        <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('admin-modal-overlay').classList.remove('active')">Hủy</button>
        <button type="submit" class="btn btn-primary" id="btn-save-item" style="flex: 1;" ${!canSave ? 'disabled' : ''}>Lưu món ăn</button>
      </div>
    </form>
  `;

  modalOverlay.classList.add('active');

  // Custom Options Form List Renderer
  function renderCustomOptionsFormList() {
    const listEl = document.getElementById('custom-options-list');
    if (!listEl) return;

    if (currentCustomOptions.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); font-size: 12px; padding: 10px;">Chưa có tùy chọn thành phần nào. Bấm "+ Thêm thành phần" bên trên.</div>`;
      return;
    }

    listEl.innerHTML = currentCustomOptions.map((opt, idx) => `
      <div class="custom-option-row" data-index="${idx}" style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 10px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-size: 10px; font-weight: 700; color: var(--color-text-muted);">MÃ OPTION (ID)</label>
            <input type="text" class="form-control opt-id-input" value="${escapeHTML(opt.id || '')}" placeholder="HANH_PHI" style="font-size: 12px; font-weight: 700; text-transform: uppercase;" />
          </div>
          <div>
            <label style="font-size: 10px; font-weight: 700; color: var(--color-text-muted);">TÊN THÀNH PHẦN</label>
            <input type="text" class="form-control opt-name-input" value="${escapeHTML(opt.name || '')}" placeholder="Hành phi" style="font-size: 12px;" />
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 12px;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="checkbox" class="opt-default-input" ${opt.defaultIncluded !== false ? 'checked' : ''} />
            <span>☑ Có sẵn mặc định</span>
          </label>

          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="checkbox" class="opt-active-input" ${opt.active !== false ? 'checked' : ''} />
            <span>☑ Đang sử dụng</span>
          </label>

          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: var(--color-text-muted);">Thứ tự:</span>
            <input type="number" class="form-control opt-order-input" value="${opt.sortOrder ?? (idx + 1) * 10}" min="0" style="width: 60px; padding: 2px 6px; font-size: 12px;" />
          </div>

          <button type="button" class="btn-remove-opt" data-index="${idx}" style="color: #ef4444; background: none; border: none; font-size: 12px; font-weight: 600; cursor: pointer; padding: 2px 4px;">
            🗑 Xóa
          </button>
        </div>
      </div>
    `).join('');

    // Bind event handlers
    listEl.querySelectorAll('.custom-option-row').forEach(row => {
      const index = parseInt(row.dataset.index, 10);
      const idInput = row.querySelector('.opt-id-input');
      const nameInput = row.querySelector('.opt-name-input');
      const defaultInput = row.querySelector('.opt-default-input');
      const activeInput = row.querySelector('.opt-active-input');
      const orderInput = row.querySelector('.opt-order-input');
      const removeBtn = row.querySelector('.btn-remove-opt');

      let userEditedId = Boolean(currentCustomOptions[index]?.id);

      idInput.oninput = () => {
        userEditedId = true;
        currentCustomOptions[index].id = idInput.value.trim().toUpperCase();
      };

      nameInput.oninput = () => {
        const val = nameInput.value;
        currentCustomOptions[index].name = val;
        if (!userEditedId) {
          const autoId = slugifyOptionId(val);
          idInput.value = autoId;
          currentCustomOptions[index].id = autoId;
        }
      };

      defaultInput.onchange = () => {
        currentCustomOptions[index].defaultIncluded = defaultInput.checked;
      };

      activeInput.onchange = () => {
        currentCustomOptions[index].active = activeInput.checked;
      };

      orderInput.oninput = () => {
        currentCustomOptions[index].sortOrder = parseInt(orderInput.value, 10) || 0;
      };

      removeBtn.onclick = () => {
        if (confirm(`Bạn có chắc chắn muốn xóa tùy chọn "${currentCustomOptions[index].name || 'thành phần'}" không?`)) {
          currentCustomOptions.splice(index, 1);
          renderCustomOptionsFormList();
        }
      };
    });
  }

  renderCustomOptionsFormList();

  const addOptBtn = document.getElementById('btn-add-custom-opt');
  if (addOptBtn) {
    addOptBtn.onclick = () => {
      if (currentCustomOptions.length >= 20) {
        showToast('Mối món tối đa 20 tùy chọn thành phần', 'error');
        return;
      }
      const newOrder = (currentCustomOptions.length + 1) * 10;
      currentCustomOptions.push({
        id: '',
        name: '',
        defaultIncluded: true,
        active: true,
        sortOrder: newOrder
      });
      renderCustomOptionsFormList();
    };
  }

  const priceInput = document.getElementById('item-price-input');
  const discountInput = document.getElementById('item-discount-input');
  const previewBox = document.getElementById('price-preview-box');

  function updatePricePreview() {
    if (!previewBox) return;
    const priceVal = parseFloat(priceInput?.value || 0);
    const discountVal = parseFloat(discountInput?.value || 0);

    if (isNaN(priceVal) || priceVal < 0 || isNaN(discountVal) || discountVal < 0 || discountVal > 100) {
      previewBox.innerHTML = `<span style="color: var(--color-accent-spicy);">⚠️ Giá bán hoặc % giảm giá không hợp lệ.</span>`;
      return;
    }

    const salePrice = calculateSalePriceClient(priceVal, discountVal);
    const saving = priceVal - salePrice;

    if (discountVal === 0) {
      previewBox.innerHTML = `<span>Giá bán cho khách: <strong>${formatVND(salePrice)}</strong> (Không giảm giá)</span>`;
    } else if (discountVal === 100) {
      previewBox.innerHTML = `<span style="color: var(--color-secondary);">Giá bán cho khách: <strong>Miễn phí (0đ)</strong> — Tiết kiệm ${formatVND(priceVal)} (100%)</span>`;
    } else {
      previewBox.innerHTML = `
        <span>Giá bán sau giảm: <strong style="color: var(--color-primary); font-size: var(--font-size-base);">${formatVND(salePrice)}</strong></span>
        <span style="color: var(--color-text-muted); margin-left: 8px;">(Tiết kiệm ${formatVND(saving)})</span>
      `;
    }
  }

  if (priceInput) priceInput.addEventListener('input', updatePricePreview);
  if (discountInput) discountInput.addEventListener('input', updatePricePreview);
  updatePricePreview();

  const form = document.getElementById('admin-item-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-item');
      if (saveBtn) saveBtn.disabled = true;

      const rawPriceStr = priceInput.value.trim();
      const rawDiscountStr = discountInput.value.trim();
      const rawStockStr = document.getElementById('item-stock-input').value.trim();

      const parsedPrice = Number(rawPriceStr);
      if (!rawPriceStr || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
        showToast('Giá gốc phải là số hợp lệ lớn hơn hoặc bằng 0', 'error');
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const parsedDiscount = Number(rawDiscountStr);
      if (rawDiscountStr === '' || !Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
        showToast('Phần trăm giảm giá phải là số từ 0 đến 100', 'error');
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const parsedStock = Number(rawStockStr);
      if (rawStockStr === '' || !Number.isInteger(parsedStock) || parsedStock < 0) {
        showToast('Số lượng tồn kho phải là số nguyên không âm', 'error');
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

      // Validate custom options before submit
      const cleanedCustomOptions = [];
      const seenIds = new Set();
      const seenNames = new Set();

      for (let i = 0; i < currentCustomOptions.length; i++) {
        const opt = currentCustomOptions[i];
        const optId = String(opt.id || '').trim().toUpperCase();
        const optName = String(opt.name || '').trim();

        if (!optId) {
          showToast(`Tùy chọn thứ ${i + 1} chưa nhập Mã ID`, 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        if (!/^[A-Z0-9_]{2,40}$/.test(optId)) {
          showToast(`Mã tùy chọn "${optId}" không hợp lệ (chỉ gồm chữ cái in hoa, số, _, từ 2-40 ký tự)`, 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        if (seenIds.has(optId)) {
          showToast(`Mã tùy chọn "${optId}" bị trùng lặp`, 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        seenIds.add(optId);

        if (!optName) {
          showToast(`Tùy chọn "${optId}" chưa nhập Tên thành phần`, 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        const normName = optName.toLowerCase();
        if (seenNames.has(normName)) {
          showToast(`Tên thành phần "${optName}" bị trùng lặp`, 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        seenNames.add(normName);

        cleanedCustomOptions.push({
          id: optId,
          name: optName,
          defaultIncluded: opt.defaultIncluded !== false,
          active: opt.active !== false,
          sortOrder: Number.isInteger(opt.sortOrder) && opt.sortOrder >= 0 ? opt.sortOrder : (i + 1) * 10
        });
      }

      const payload = {
        id: itemIdVal,
        name: document.getElementById('item-name-input').value.trim(),
        categoryId: catSelect.value,
        price: parsedPrice,
        discountPercent: parsedDiscount,
        stockQuantity: parsedStock,
        customizationOptions: cleanedCustomOptions,
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
