/**
 * Food Order Bridge - Bottom Sheet Drawer for Quick View & Checkout
 */
import { formatVND, buildAltText } from '../common/utils.js';
import { cart } from './cart.js';

export function setupQuickViewDrawer() {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  // Close modal when clicking overlay background
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
    modalOverlay.classList.remove('active');
  }
}

export function openQuickView(item) {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  const currentQty = cart.getItemQuantity(item.id);

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="text-align: center; margin-bottom: var(--space-4);">
      <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'}" 
           alt="${buildAltText(item.name, item.category)}" 
           style="width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--radius-lg); margin-bottom: var(--space-4);" />
      <h3 style="font-size: var(--font-size-xl); font-weight: 800; text-align: left;">${item.name}</h3>
      <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); text-align: left; margin-top: 4px;">${item.description || ''}</p>
      <div style="font-size: var(--font-size-2xl); font-weight: 800; color: var(--color-primary); text-align: left; margin-top: var(--space-2);">
        ${formatVND(item.price)}
      </div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
      <span style="font-weight: 600;">Số lượng đặt</span>
      <div class="stepper" id="drawer-stepper-${item.id}">
        <button class="stepper-btn" onclick="updateDrawerQty('${item.id}', -1)">-</button>
        <span class="stepper-val" id="drawer-qty-val">${currentQty || 1}</span>
        <button class="stepper-btn" onclick="updateDrawerQty('${item.id}', 1)">+</button>
      </div>
    </div>

    <button class="btn btn-primary" style="width: 100%; margin-top: var(--space-6);" id="btn-add-from-drawer">
      Thêm vào giỏ hàng (${formatVND(item.price * (currentQty || 1))})
    </button>
  `;

  let localQty = currentQty || 1;

  window.updateDrawerQty = (id, delta) => {
    localQty = Math.max(1, localQty + delta);
    const qtyVal = document.getElementById('drawer-qty-val');
    const addBtn = document.getElementById('btn-add-from-drawer');
    if (qtyVal) qtyVal.textContent = localQty;
    if (addBtn) addBtn.textContent = `Thêm vào giỏ hàng (${formatVND(item.price * localQty)})`;
  };

  const addBtn = document.getElementById('btn-add-from-drawer');
  if (addBtn) {
    addBtn.onclick = () => {
      cart.addItem(item, localQty - currentQty);
      closeDrawer();
    };
  }

  modalOverlay.classList.add('active');
}
