/**
 * Food Order Bridge - Bottom Sheet Drawer for Quick View & Customization Options
 */
import { formatVND, buildAltText, escapeHTML, showToast } from '../common/utils.js';
import { openAccessibleModal, closeAccessibleModal } from '../common/modal-helper.js';
import { cart } from './cart.js';

function calculateSalePriceClient(price, discountPercent = 0) {
  const numPrice = Number(price) || 0;
  const numDiscount = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  return Math.round(numPrice * (100 - numDiscount) / 100);
}

export function setupQuickViewDrawer() {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeDrawer();
    }
  });

  window.closeDrawer = closeDrawer;
}

export function closeDrawer() {
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    closeAccessibleModal(modalOverlay);
  }
}

export function openQuickView(item) {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  const stock = item.stockQuantity ?? 0;
  const isOutOfStock = stock <= 0;

  const price = Number(item.price) || 0;
  const discountPercent = item.discountPercent || 0;
  const salePrice = item.salePrice !== undefined ? item.salePrice : calculateSalePriceClient(price, discountPercent);
  const hasDiscount = discountPercent > 0 && price > salePrice;
  const savings = price - salePrice;

  // Active options sorted by sortOrder
  const activeOptions = Array.isArray(item.customizationOptions)
    ? item.customizationOptions.filter(o => o.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];

  let optionsSectionHtml = '';
  if (activeOptions.length > 0) {
    optionsSectionHtml = `
      <div class="customization-section" style="margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border); text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h4 style="font-weight: 700; font-size: var(--font-size-md);">Tùy chọn thành phần</h4>
        </div>
        <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-bottom: 12px;">
          Bỏ dấu tích nếu bạn không muốn dùng thành phần này.
        </p>

        <div class="options-checklist">
          ${activeOptions.map(opt => `
            <label class="custom-option-label" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--color-bg-subtle, #f9fafb); border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" 
                     class="custom-option-checkbox" 
                     data-option-id="${escapeHTML(opt.id)}" 
                     data-option-name="${escapeHTML(opt.name)}" 
                     ${opt.defaultIncluded !== false ? 'checked' : ''} 
                     style="width: 18px; height: 18px; accent-color: var(--color-primary);" />
              <span style="font-weight: 600; font-size: var(--font-size-sm);">${escapeHTML(opt.name)}</span>
            </label>
          `).join('')}
        </div>

        <div class="customization-summary" id="custom-summary-text" aria-live="polite" style="margin-top: 8px; font-size: var(--font-size-xs); font-weight: 700; padding: 8px 12px; border-radius: var(--radius-sm); display: block;">
          Giữ nguyên thành phần mặc định
        </div>
      </div>
    `;
  }

  let localQty = isOutOfStock ? 0 : 1;

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="text-align: center; margin-bottom: var(--space-4);">
      <div style="position: relative;">
        <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'}" 
             alt="${buildAltText(escapeHTML(item.name), escapeHTML(item.category))}" 
             style="width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--radius-lg); margin-bottom: var(--space-4); ${isOutOfStock ? 'opacity: 0.5;' : ''}" />
        ${hasDiscount ? `<span class="badge badge-discount" style="position: absolute; top: 12px; right: 12px; font-size: 14px; padding: 4px 10px;">-${discountPercent}%</span>` : ''}
      </div>

      <h3 style="font-size: var(--font-size-xl); font-weight: 800; text-align: left;">${escapeHTML(item.name)}</h3>
      <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); text-align: left; margin-top: 4px;">${escapeHTML(item.description || '')}</p>
      
      <div style="text-align: left; margin-top: var(--space-2);">
        ${hasDiscount ? `
          <div style="display: flex; align-items: baseline; gap: 8px;">
            <span style="font-size: var(--font-size-2xl); font-weight: 800; color: var(--color-accent-spicy);">${formatVND(salePrice)}</span>
            <span style="font-size: var(--font-size-sm); text-decoration: line-through; color: var(--color-text-muted);">${formatVND(price)}</span>
          </div>
          <div style="font-size: var(--font-size-xs); color: var(--color-secondary); font-weight: 600;">Tiết kiệm ${formatVND(savings)} (${discountPercent}%)</div>
        ` : `
          <div style="font-size: var(--font-size-2xl); font-weight: 800; color: var(--color-primary);">${formatVND(price)}</div>
        `}
      </div>
      
      <div style="text-align: left; margin-top: 6px; font-size: var(--font-size-xs); font-weight: 600; color: ${isOutOfStock ? '#ef4444' : (stock <= 3 ? '#f59e0b' : 'var(--color-text-muted)')};">
        ${isOutOfStock ? '⚠️ Món hiện đang hết hàng' : (stock <= 3 ? `🔥 Chỉ còn ${stock} phần` : `Số lượng còn lại: ${stock} phần`)}
      </div>
    </div>

    ${optionsSectionHtml}

    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
      <div>
        <span style="font-weight: 600;">Số lượng mua</span>
        <div style="font-size: 11px; color: var(--color-text-muted);">Tùy chọn này áp dụng cho toàn bộ số lượng đang thêm.</div>
      </div>
      <div class="stepper" id="drawer-stepper-${escapeHTML(item.id)}">
        <button class="stepper-btn" onclick="updateDrawerQty('${escapeHTML(item.id)}', -1)" ${isOutOfStock || localQty <= 1 ? 'disabled' : ''}>-</button>
        <span class="stepper-val" id="drawer-qty-val">${localQty}</span>
        <button class="stepper-btn" onclick="updateDrawerQty('${escapeHTML(item.id)}', 1)" ${isOutOfStock || localQty >= stock ? 'disabled' : ''}>+</button>
      </div>
    </div>

    <button class="btn btn-primary" style="width: 100%; margin-top: var(--space-6);" id="btn-add-from-drawer" ${isOutOfStock ? 'disabled' : ''}>
      ${isOutOfStock ? 'Món hiện đã hết hàng' : `Thêm vào giỏ hàng (${formatVND(salePrice * localQty)})`}
    </button>
  `;

  // Customization summary dynamic updater
  const updateSummary = () => {
    const summaryEl = document.getElementById('custom-summary-text');
    if (!summaryEl) return;

    const uncheckedBoxes = drawerContent.querySelectorAll('.custom-option-checkbox:not(:checked)');
    if (uncheckedBoxes.length === 0) {
      summaryEl.style.background = '#f0fdf4';
      summaryEl.style.color = '#166534';
      summaryEl.style.border = '1px solid #bbf7d0';
      summaryEl.textContent = '✓ Giữ nguyên thành phần mặc định';
    } else {
      const names = Array.from(uncheckedBoxes).map(cb => cb.dataset.optionName);
      summaryEl.style.background = '#fef2f2';
      summaryEl.style.color = '#991b1b';
      summaryEl.style.border = '1px solid #fecaca';
      summaryEl.textContent = `🚫 KHÔNG LẤY: ${names.join(', ')}`;
    }
  };

  drawerContent.querySelectorAll('.custom-option-checkbox').forEach(cb => {
    cb.addEventListener('change', updateSummary);
  });
  updateSummary();

  window.updateDrawerQty = (id, delta) => {
    if (isOutOfStock) return;
    const newQty = localQty + delta;
    if (newQty < 1 || newQty > stock) return;

    localQty = newQty;
    const qtyVal = document.getElementById('drawer-qty-val');
    const addBtn = document.getElementById('btn-add-from-drawer');
    const decBtn = document.querySelector(`#drawer-stepper-${escapeHTML(id)} .stepper-btn:first-child`);
    const incBtn = document.querySelector(`#drawer-stepper-${escapeHTML(id)} .stepper-btn:last-child`);

    if (qtyVal) qtyVal.textContent = localQty;
    if (addBtn) addBtn.textContent = `Thêm vào giỏ hàng (${formatVND(salePrice * localQty)})`;
    if (decBtn) decBtn.disabled = localQty <= 1;
    if (incBtn) incBtn.disabled = localQty >= stock;
  };

  const addBtn = document.getElementById('btn-add-from-drawer');
  if (addBtn && !isOutOfStock) {
    addBtn.onclick = () => {
      const uncheckedBoxes = drawerContent.querySelectorAll('.custom-option-checkbox:not(:checked)');
      const excludedOptionIds = Array.from(uncheckedBoxes).map(cb => cb.dataset.optionId);

      const success = cart.addConfiguredItem(item, localQty, excludedOptionIds);
      if (success) {
        showToast(`Đã thêm ${localQty} phần "${item.name}" vào giỏ hàng`, 'success');
        closeDrawer();
      }
    };
  }

  openAccessibleModal(modalOverlay, drawerContent);
}
