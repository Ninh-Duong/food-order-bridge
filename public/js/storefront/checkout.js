/**
 * Food Order Bridge - Checkout & Order Submission Logic
 * Supports DELIVERY & DINE_IN fulfillment options, strict VN phone validation,
 * recent delivery addresses, and geolocation assistance.
 */
import { API } from '../common/api.js';
import { formatVND, showToast, escapeHTML } from '../common/utils.js';
import { setButtonLoading, restoreButton } from '../common/ui-state.js';
import { cart } from './cart.js';
import { closeDrawer } from './quick-view-drawer.js';

let activeCheckoutRequestId = null;
let lastPayloadFingerprint = null;
let activeFulfillmentType = 'DELIVERY'; // 'DELIVERY' | 'DINE_IN'
let activePaymentMethod = 'CASH'; // 'CASH' | 'BANK_QR' | 'MOMO_QR'
let paymentPollTimer = null;
let activeOrderActionToken = null;

const RECENT_ADDRESS_KEY = 'food_order_recent_addresses';
const LAST_ORDER_ACTION_KEY = 'food_order_last_action';

function saveOrderAction(orderId, actionToken) {
  if (!orderId || !actionToken) return;
  activeOrderActionToken = actionToken;
  try {
    localStorage.setItem(LAST_ORDER_ACTION_KEY, JSON.stringify({ orderId, actionToken }));
  } catch (e) {}
}

function getStoredOrderAction(orderId) {
  try {
    const raw = localStorage.getItem(LAST_ORDER_ACTION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.orderId === orderId && parsed.actionToken) return parsed.actionToken;
  } catch (e) {}
  return null;
}

function getRecentAddresses() {
  try {
    const raw = localStorage.getItem(RECENT_ADDRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveRecentAddress(addressStr) {
  if (!addressStr) return;
  const clean = addressStr.trim().replace(/\s+/g, ' ');
  if (clean.length < 5) return;
  try {
    const current = getRecentAddresses();
    const filtered = current.filter(item => item.toLowerCase() !== clean.toLowerCase());
    filtered.unshift(clean);
    const updated = filtered.slice(0, 3);
    localStorage.setItem(RECENT_ADDRESS_KEY, JSON.stringify(updated));
  } catch (e) {}
}

function removeRecentAddress(index) {
  try {
    const current = getRecentAddresses();
    if (index >= 0 && index < current.length) {
      current.splice(index, 1);
      localStorage.setItem(RECENT_ADDRESS_KEY, JSON.stringify(current));
    }
  } catch (e) {}
}

function generateRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getPayloadFingerprint(items, fulfillmentType) {
  return JSON.stringify({
    fulfillmentType,
    items: items.map(i => ({ p: i.productId, q: i.quantity, ex: (i.excludedOptionIds || []).sort() })).sort((a, b) => a.p.localeCompare(b.p))
  });
}

function calculateSalePriceClient(price, discountPercent = 0) {
  const numPrice = Number(price) || 0;
  const numDiscount = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  return Math.round(numPrice * (100 - numDiscount) / 100);
}

export function setupCheckoutModal() {
  const checkoutBtn = document.getElementById('btn-open-checkout');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', openCheckoutDrawer);
  }
}

async function openCheckoutDrawer() {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');
  const checkoutBtn = document.getElementById('btn-open-checkout');

  if (!modalOverlay || !drawerContent) return;

  if (cart.getTotalCount() === 0) {
    showToast('Giỏ hàng của bạn đang trống!', 'error');
    return;
  }

  // 1. Mở drawer ngay lập tức với trạng thái Skeleton Loading & disable nút mở
  if (checkoutBtn) setButtonLoading(checkoutBtn, 'Đang mở...');
  
  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="padding: var(--space-6) var(--space-4); text-align: center;">
      <div class="spinner-sm" style="width: 32px; height: 32px; color: var(--color-primary); margin: 0 auto 12px auto; display: block;"></div>
      <p style="font-size: 14px; font-weight: 600; color: var(--color-text-muted);">Đang kiểm tra giỏ hàng và tồn kho...</p>
    </div>
  `;
  modalOverlay.classList.add('active');

  try {
    // 2. Revalidate thực đơn & kiểm tra payment capacity trong background
    const [menuRes, capacity] = await Promise.all([
      API.get('/api/menu').catch(err => { console.warn('Revalidation fetch failed:', err.message); return null; }),
      API.get('/api/orders/payment-capacity').catch(err => { console.warn('[Payment Capacity Check]', err.message); return null; })
    ]);

    if (menuRes && menuRes.items) {
      cart.reconcileWithMenu(menuRes.items);
    }

    if (checkoutBtn) restoreButton(checkoutBtn);

    const count = cart.getTotalCount();
    if (count === 0) {
      showToast('Tất cả món trong giỏ hàng hiện đã hết hàng hoặc ngưng bán.', 'error');
      closeDrawer();
      return;
    }

    if (capacity?.blocked) {
      showPaymentCapacityWarning(capacity);
      return;
    }

    renderCheckoutContent();
  } catch (err) {
    if (checkoutBtn) restoreButton(checkoutBtn);
    renderCheckoutContent();
  }
}

async function checkPaymentCapacity(showWarning = true) {
  try {
    const capacity = await API.get('/api/orders/payment-capacity');
    if (capacity.blocked && activeFulfillmentType === 'DINE_IN') {
      if (showWarning) showPaymentCapacityWarning(capacity);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Payment Capacity Check]', err.message);
    return true;
  }
}

function showPaymentCapacityWarning(capacity = {}) {
  const drawerContent = document.getElementById('drawer-content');
  const modalOverlay = document.getElementById('modal-overlay');
  if (!drawerContent || !modalOverlay) return;
  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="text-align: center; padding: var(--space-5) 0;">
      <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
      <h3 style="font-size: var(--font-size-xl); font-weight: 800; color: #b45309;">Hệ thống đang quá tải</h3>
      <p style="font-size: 14px; line-height: 1.6; color: var(--color-text-muted); margin: 12px 0 20px;">
        Hiện tại hệ thống đã có ${Number(capacity.pendingCount) || 3}/${Number(capacity.limit) || 3} đơn chờ thanh toán.
        Vui lòng liên hệ chủ quán để được hỗ trợ.
      </p>
      <button class="btn btn-secondary" id="btn-close-capacity-warning" style="width: 100%;">Quay lại</button>
    </div>
  `;
  document.getElementById('btn-close-capacity-warning')?.addEventListener('click', renderCheckoutContent);
  modalOverlay.classList.add('active');
}

function renderCheckoutContent() {
  const drawerContent = document.getElementById('drawer-content');
  if (!drawerContent) return;

  const count = cart.getTotalCount();
  if (count === 0) {
    closeDrawer();
    return;
  }

  const subtotal = cart.getSubtotalAmount();
  const discount = cart.getDiscountAmount();
  const total = cart.getTotalAmount();
  const cartEntries = Array.from(cart.items.values());

  const recentAddresses = getRecentAddresses();

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <h3 style="font-size: var(--font-size-xl); font-weight: 800; margin-bottom: var(--space-4);">Xác nhận đặt hàng</h3>

    <div style="background-color: var(--color-bg-alt); padding: var(--space-4); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
      <h4 style="font-size: var(--font-size-sm); font-weight: 700; margin-bottom: var(--space-2);">Món đã chọn (${count})</h4>
      
      <div id="checkout-items-list" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px;">
        ${cartEntries.map(entry => {
          const origPrice = Number(entry.item.price) || 0;
          const salePrice = entry.item.salePrice !== undefined ? entry.item.salePrice : calculateSalePriceClient(origPrice, entry.item.discountPercent);
          const lineTotal = salePrice * entry.quantity;

          const itemOptions = Array.isArray(entry.item.customizationOptions) ? entry.item.customizationOptions : [];
          const optMap = new Map(itemOptions.map(o => [o.id, o.name]));
          const excludedNames = (entry.excludedOptionIds || []).map(id => optMap.get(id) || id);
          
          const hasExclusions = excludedNames.length > 0;
          const exclusionText = hasExclusions ? `Không lấy: ${excludedNames.join(', ')}` : 'Giữ nguyên thành phần';

          return `
            <div class="checkout-item-row" data-line-id="${escapeHTML(entry.lineId)}" data-product-id="${escapeHTML(entry.productId)}" style="border-bottom: 1px dashed var(--color-border); padding-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; font-size: var(--font-size-sm);">
                <div style="flex: 1;">
                  <strong style="display: block; font-size: 14px;">${escapeHTML(entry.item.name)}</strong>
                  <div style="font-size: 12px; font-weight: 600; color: ${hasExclusions ? '#dc2626' : 'var(--color-text-muted)'}; margin-top: 2px;">
                    ${escapeHTML(exclusionText)}
                  </div>
                  <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">
                    ${formatVND(salePrice)}/phần
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                  <span style="font-weight: 700; color: var(--color-primary);">${formatVND(lineTotal)}</span>
                  
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="stepper" style="transform: scale(0.85); transform-origin: right center;">
                      <button class="stepper-btn" onclick="window.updateCheckoutLine('${escapeHTML(entry.lineId)}', -1)">-</button>
                      <span class="stepper-val">${entry.quantity}</span>
                      <button class="stepper-btn" onclick="window.updateCheckoutLine('${escapeHTML(entry.lineId)}', 1)">+</button>
                    </div>
                    <button class="btn-text-danger" onclick="window.removeCheckoutLine('${escapeHTML(entry.lineId)}')" style="font-size: 12px; color: #ef4444; border: none; background: none; cursor: pointer; padding: 2px 4px;">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div style="border-top: 1px solid var(--color-border); margin-top: var(--space-3); padding-top: var(--space-2); display: flex; flex-direction: column; gap: 4px; font-size: var(--font-size-sm);">
        <div style="display: flex; justify-content: space-between; color: var(--color-text-muted);">
          <span>Tạm tính</span>
          <span>${formatVND(subtotal)}</span>
        </div>
        ${discount > 0 ? `
          <div style="display: flex; justify-content: space-between; color: var(--color-accent-spicy);">
            <span>Giảm giá</span>
            <span>-${formatVND(discount)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: var(--font-size-base); margin-top: 4px; color: var(--color-primary);">
          <span>Tổng thanh toán</span>
          <span>${formatVND(total)}</span>
        </div>
      </div>
    </div>

    <!-- Fulfillment Type Segmented Cards -->
    <div class="form-group" style="margin-bottom: var(--space-4);">
      <label class="form-label" style="font-weight: 700; margin-bottom: 6px; display: block;">Hình thức nhận món *</label>
      <div class="fulfillment-selector" role="radiogroup" aria-label="Hình thức nhận món">
        <label class="fulfillment-option ${activeFulfillmentType === 'DELIVERY' ? 'is-selected' : ''}" id="option-delivery">
          <input type="radio" name="fulfillmentType" value="DELIVERY" ${activeFulfillmentType === 'DELIVERY' ? 'checked' : ''} />
          <div class="fulfillment-card-content">
            <span class="fulfillment-icon">🛵</span>
            <div class="fulfillment-text">
              <span class="fulfillment-title">Giao tận nơi</span>
              <span class="fulfillment-desc">Nhập địa chỉ nhận món</span>
            </div>
            <span class="fulfillment-check">✓</span>
          </div>
        </label>
        <label class="fulfillment-option ${activeFulfillmentType === 'DINE_IN' ? 'is-selected' : ''}" id="option-dine-in">
          <input type="radio" name="fulfillmentType" value="DINE_IN" ${activeFulfillmentType === 'DINE_IN' ? 'checked' : ''} />
          <div class="fulfillment-card-content">
            <span class="fulfillment-icon">🍽️</span>
            <div class="fulfillment-text">
              <span class="fulfillment-title">Dùng tại quán</span>
              <span class="fulfillment-desc">Không cần địa chỉ</span>
            </div>
            <span class="fulfillment-check">✓</span>
          </div>
        </label>
      </div>
    </div>

    <form id="checkout-form" novalidate>
      <div id="customer-contact-section" style="${activeFulfillmentType === 'DINE_IN' ? 'display: none;' : 'display: block;'}">
        <div class="form-group">
          <label class="form-label" for="cust-name">Họ và tên *</label>
          <input type="text" id="cust-name" class="form-control" placeholder="VD: Nguyễn Văn A" ${activeFulfillmentType === 'DELIVERY' ? 'required' : ''} />
          <div class="field-error" id="err-cust-name" style="display: none;"></div>
        </div>

        <div class="form-group">
          <label class="form-label" for="cust-phone">Số điện thoại *</label>
          <input type="tel" id="cust-phone" class="form-control" placeholder="VD: 0901234567" inputmode="numeric" autocomplete="tel" maxlength="10" ${activeFulfillmentType === 'DELIVERY' ? 'required' : ''} />
          <div class="field-error" id="err-cust-phone" style="display: none;">Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.</div>
        </div>
      </div>

      <div class="form-group checkout-address-section" id="address-section" style="${activeFulfillmentType === 'DINE_IN' ? 'display: none;' : 'display: block;'}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label class="form-label" for="cust-address" style="margin-bottom: 0;">Địa chỉ giao hàng *</label>
          <button type="button" class="btn-location-link" id="btn-use-location" style="font-size: 12px; color: var(--color-primary); background: none; border: none; cursor: pointer; font-weight: 600;">
            ◎ Dùng vị trí hiện tại
          </button>
        </div>
        <input type="text" id="cust-address" class="form-control" placeholder="📍 Số nhà, tên đường, phường/xã, quận/huyện..." ${activeFulfillmentType === 'DELIVERY' ? 'required' : ''} />
        <div class="field-error" id="err-cust-address" style="display: none;">Vui lòng nhập địa chỉ giao hàng cụ thể.</div>

        <div class="recent-address-container" id="recent-address-container" style="${recentAddresses.length > 0 ? 'display: block;' : 'display: none;'} margin-top: 8px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--color-text-muted); margin-bottom: 4px;">Địa chỉ gần đây:</div>
          <div class="recent-address-list" id="recent-address-list" style="display: flex; flex-direction: column; gap: 4px;">
            ${recentAddresses.map((addr, idx) => `
              <div class="recent-address-item" style="display: flex; align-items: center; justify-content: space-between; background: var(--color-bg-alt); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 12px; border: 1px solid var(--color-border); cursor: pointer;">
                <span class="recent-addr-click" data-address="${escapeHTML(addr)}" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📍 ${escapeHTML(addr)}</span>
                <button type="button" class="btn-remove-recent" data-index="${idx}" style="border: none; background: none; color: var(--color-text-muted); font-size: 12px; padding: 2px 6px; cursor: pointer;" title="Xóa khỏi danh sách">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="form-group" id="payment-section" style="${activeFulfillmentType === 'DINE_IN' ? 'display: block;' : 'display: none;'} margin-bottom: var(--space-4);">
        <label class="form-label" style="font-weight: 700; margin-bottom: 6px; display: block;">Phương thức thanh toán *</label>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label class="fulfillment-option ${activePaymentMethod === 'CASH' ? 'is-selected' : ''}" id="payment-option-cash" style="padding: 10px 12px;">
            <input type="radio" name="paymentMethod" value="CASH" ${activePaymentMethod === 'CASH' ? 'checked' : ''} />
            <div class="fulfillment-card-content">
              <span class="fulfillment-icon">💵</span>
              <div class="fulfillment-text"><span class="fulfillment-title">Tiền mặt tại quán</span><span class="fulfillment-desc">Nhân viên xác nhận khi nhận tiền</span></div>
              <span class="fulfillment-check">✓</span>
            </div>
          </label>
          <label class="fulfillment-option ${activePaymentMethod === 'BANK_QR' ? 'is-selected' : ''}" id="payment-option-bank" style="padding: 10px 12px;">
            <input type="radio" name="paymentMethod" value="BANK_QR" ${activePaymentMethod === 'BANK_QR' ? 'checked' : ''} />
            <div class="fulfillment-card-content">
              <span class="fulfillment-icon">🏦</span>
              <div class="fulfillment-text"><span class="fulfillment-title">QR ngân hàng</span><span class="fulfillment-desc">VietQR theo đúng số tiền đơn hàng</span></div>
              <span class="fulfillment-check">✓</span>
            </div>
          </label>
          <label class="fulfillment-option ${activePaymentMethod === 'MOMO_QR' ? 'is-selected' : ''}" id="payment-option-momo" style="padding: 10px 12px;">
            <input type="radio" name="paymentMethod" value="MOMO_QR" ${activePaymentMethod === 'MOMO_QR' ? 'checked' : ''} />
            <div class="fulfillment-card-content">
              <span class="fulfillment-icon">🟣</span>
              <div class="fulfillment-text"><span class="fulfillment-title">QR MoMo</span><span class="fulfillment-desc">MoMo Merchant hoặc QR mô phỏng khi chưa cấu hình</span></div>
              <span class="fulfillment-check">✓</span>
            </div>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="cust-note">Hướng dẫn giao hàng / Ghi chú</label>
        <input type="text" id="cust-note" class="form-control" placeholder="VD: Giao trước 19:15, gói riêng nước..." />
      </div>

      <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: var(--space-4);" id="btn-submit-order">
        🚀 ${activeFulfillmentType === 'DINE_IN' ? 'Đặt dùng tại quán' : 'Đặt giao tận nơi'} · ${formatVND(total)}
      </button>
    </form>
  `;

  // Attach Stepper logic
  window.updateCheckoutLine = (lineId, delta) => {
    cart.updateLineQuantity(lineId, delta);
    if (cart.getTotalCount() === 0) {
      closeDrawer();
    } else {
      renderCheckoutContent();
    }
  };

  window.removeCheckoutLine = (lineId) => {
    cart.removeLine(lineId);
    if (cart.getTotalCount() === 0) {
      closeDrawer();
    } else {
      renderCheckoutContent();
    }
  };

  // Event handlers for Fulfillment radios
  const radioDelivery = document.querySelector('input[name="fulfillmentType"][value="DELIVERY"]');
  const radioDineIn = document.querySelector('input[name="fulfillmentType"][value="DINE_IN"]');

  const updateFulfillmentUI = (type) => {
    activeFulfillmentType = type;
    const optionDelivery = document.getElementById('option-delivery');
    const optionDineIn = document.getElementById('option-dine-in');
    const addressSection = document.getElementById('address-section');
    const addressInput = document.getElementById('cust-address');
    const errAddress = document.getElementById('err-cust-address');
    const customerContactSection = document.getElementById('customer-contact-section');
    const nameInput = document.getElementById('cust-name');
    const phoneInput = document.getElementById('cust-phone');
    const submitBtn = document.getElementById('btn-submit-order');
    const paymentSection = document.getElementById('payment-section');

    if (type === 'DELIVERY') {
      if (optionDelivery) optionDelivery.classList.add('is-selected');
      if (optionDineIn) optionDineIn.classList.remove('is-selected');
      if (addressSection) addressSection.style.display = 'block';
      if (addressInput) addressInput.setAttribute('required', 'true');
      if (customerContactSection) customerContactSection.style.display = 'block';
      if (nameInput) nameInput.setAttribute('required', 'true');
      if (phoneInput) phoneInput.setAttribute('required', 'true');
      if (paymentSection) paymentSection.style.display = 'none';
      activePaymentMethod = 'CASH';
      if (submitBtn) submitBtn.innerHTML = `🚀 Đặt giao tận nơi · ${formatVND(cart.getTotalAmount())}`;
    } else {
      if (optionDineIn) optionDineIn.classList.add('is-selected');
      if (optionDelivery) optionDelivery.classList.remove('is-selected');
      if (addressSection) addressSection.style.display = 'none';
      if (addressInput) addressInput.removeAttribute('required');
      if (customerContactSection) customerContactSection.style.display = 'none';
      if (nameInput) nameInput.removeAttribute('required');
      if (phoneInput) phoneInput.removeAttribute('required');
      if (paymentSection) paymentSection.style.display = 'block';
      if (errAddress) errAddress.style.display = 'none';
      if (submitBtn) submitBtn.innerHTML = `${activePaymentMethod === 'CASH' ? '🚀 Đặt dùng tại quán' : '💳 Tiếp tục thanh toán'} · ${formatVND(cart.getTotalAmount())}`;
    }
  };

  if (radioDelivery) {
    radioDelivery.addEventListener('change', () => updateFulfillmentUI('DELIVERY'));
  }
  if (radioDineIn) {
    radioDineIn.addEventListener('change', async () => {
      updateFulfillmentUI('DINE_IN');
      await checkPaymentCapacity(true);
    });
  }

  updateFulfillmentUI(activeFulfillmentType);

  document.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
    input.addEventListener('change', () => {
      activePaymentMethod = input.value;
      document.querySelectorAll('#payment-section .fulfillment-option').forEach(option => option.classList.remove('is-selected'));
      const selected = document.querySelector(`#payment-section input[value="${activePaymentMethod}"]`);
      if (selected) selected.closest('.fulfillment-option')?.classList.add('is-selected');
      const submitBtn = document.getElementById('btn-submit-order');
      if (submitBtn && activeFulfillmentType === 'DINE_IN') {
        submitBtn.innerHTML = `${activePaymentMethod === 'CASH' ? '🚀 Đặt dùng tại quán' : '💳 Tiếp tục thanh toán'} · ${formatVND(cart.getTotalAmount())}`;
      }
    });
  });

  // Geolocation button
  const locBtn = document.getElementById('btn-use-location');
  if (locBtn) {
    locBtn.addEventListener('click', handleUseCurrentLocation);
  }

  // Phone input formatting on type/paste
  const phoneInput = document.getElementById('cust-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      const clean = e.target.value.replace(/[\s.-]/g, '').slice(0, 10);
      e.target.value = clean;
      const errPhone = document.getElementById('err-cust-phone');
      if (errPhone && (clean.length === 10 || clean.length === 0)) {
        errPhone.style.display = 'none';
      }
    });
  }

  // Address input error clearing
  const addressInput = document.getElementById('cust-address');
  if (addressInput) {
    addressInput.addEventListener('input', () => {
      const errAddr = document.getElementById('err-cust-address');
      if (errAddr) errAddr.style.display = 'none';
    });
  }

  // Recent Address click / remove delegation
  const recentContainer = document.getElementById('recent-address-container');
  if (recentContainer) {
    recentContainer.addEventListener('click', (e) => {
      const addrClick = e.target.closest('.recent-addr-click');
      if (addrClick) {
        const selectedAddr = addrClick.dataset.address;
        if (addressInput && selectedAddr) {
          addressInput.value = selectedAddr;
          const errAddr = document.getElementById('err-cust-address');
          if (errAddr) errAddr.style.display = 'none';
        }
        return;
      }

      const removeBtn = e.target.closest('.btn-remove-recent');
      if (removeBtn) {
        e.stopPropagation();
        const idx = parseInt(removeBtn.dataset.index, 10);
        removeRecentAddress(idx);
        renderCheckoutContent();
      }
    });
  }

  const form = document.getElementById('checkout-form');
  if (form) {
    form.addEventListener('submit', handleOrderSubmit);
  }
}

function handleUseCurrentLocation() {
  const locBtn = document.getElementById('btn-use-location');
  if (!navigator.geolocation) {
    showToast('Trình duyệt của bạn không hỗ trợ vị trí địa lý.', 'warning');
    return;
  }

  if (locBtn) {
    locBtn.disabled = true;
    locBtn.textContent = '⏳ Đang lấy vị trí...';
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (locBtn) {
        locBtn.disabled = false;
        locBtn.textContent = '◎ Dùng vị trí hiện tại';
      }
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
      showToast('Đã mở Google Maps với tọa độ hiện tại. Vui lòng điền địa chỉ chi tiết.', 'info');
    },
    (err) => {
      if (locBtn) {
        locBtn.disabled = false;
        locBtn.textContent = '◎ Dùng vị trí hiện tại';
      }
      showToast('Không thể lấy vị trí hiện tại. Vui lòng tự nhập địa chỉ giao hàng.', 'warning');
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

async function handleOrderSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('cust-name');
  const phoneInput = document.getElementById('cust-phone');
  const addressInput = document.getElementById('cust-address');
  const noteInput = document.getElementById('cust-note');

  const errName = document.getElementById('err-cust-name');
  const errPhone = document.getElementById('err-cust-phone');
  const errAddress = document.getElementById('err-cust-address');

  if (errName) errName.style.display = 'none';
  if (errPhone) errPhone.style.display = 'none';
  if (errAddress) errAddress.style.display = 'none';

  let hasError = false;

  const name = activeFulfillmentType === 'DELIVERY' && nameInput ? nameInput.value.trim() : '';
  if (activeFulfillmentType === 'DELIVERY' && !name) {
    if (errName) {
      errName.textContent = 'Vui lòng nhập họ và tên.';
      errName.style.display = 'block';
    }
    hasError = true;
  }

  const phoneRaw = activeFulfillmentType === 'DELIVERY' && phoneInput ? phoneInput.value : '';
  const phone = phoneRaw.replace(/[\s.-]/g, '');
  if (activeFulfillmentType === 'DELIVERY' && !/^0\d{9}$/.test(phone)) {
    if (errPhone) {
      errPhone.textContent = 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.';
      errPhone.style.display = 'block';
    }
    hasError = true;
  }

  let address = '';
  if (activeFulfillmentType === 'DELIVERY') {
    address = addressInput ? addressInput.value.trim().replace(/\s+/g, ' ') : '';
    if (address.length < 5) {
      if (errAddress) {
        errAddress.textContent = 'Vui lòng nhập địa chỉ giao hàng cụ thể.';
        errAddress.style.display = 'block';
      }
      hasError = true;
    }
  }

  if (hasError) return;

  const submitBtn = document.getElementById('btn-submit-order');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý đơn hàng...';
  }

  const note = noteInput ? noteInput.value.trim() : '';
  const currentPayloadItems = cart.getPayloadItems();
  const currentFingerprint = getPayloadFingerprint(currentPayloadItems, activeFulfillmentType);

  if (!activeCheckoutRequestId || lastPayloadFingerprint !== currentFingerprint) {
    activeCheckoutRequestId = generateRequestId();
    lastPayloadFingerprint = currentFingerprint;
  }

  const payload = {
    requestId: activeCheckoutRequestId,
    fulfillmentType: activeFulfillmentType,
    paymentMethod: activeFulfillmentType === 'DINE_IN' ? activePaymentMethod : 'CASH',
    customer: { name, phone, address, note },
    items: currentPayloadItems
  };

  try {
    const response = await API.post('/api/orders', payload);
    const orderData = response.data;
    saveOrderAction(orderData.orderId, orderData.actionToken);

    if (activeFulfillmentType === 'DELIVERY' && address) {
      saveRecentAddress(address);
    }

    activeCheckoutRequestId = null;
    lastPayloadFingerprint = null;

    cart.clear();
    closeDrawer();

    if (activeFulfillmentType === 'DINE_IN' && orderData.payment?.paymentStatus === 'PENDING') {
      showPaymentPendingModal(orderData);
    } else {
      showOrderSuccessModal(orderData, activeFulfillmentType, address);
    }
  } catch (error) {
    if (error.code === 'PAYMENT_CAPACITY_FULL') {
      showPaymentCapacityWarning({ pendingCount: error.pendingCount, limit: error.limit });
      return;
    }

    if (error.code === 'INSUFFICIENT_STOCK' || error.status === 409) {
      showToast(error.message || 'Món ăn trong giỏ hàng đã thay đổi tồn kho!', 'error');

      try {
        const menuRes = await API.get('/api/menu');
        const latestItems = menuRes.items || [];
        cart.reconcileWithMenu(latestItems);
      } catch (e) {}

      activeCheckoutRequestId = generateRequestId();
      lastPayloadFingerprint = getPayloadFingerprint(cart.getPayloadItems(), activeFulfillmentType);

      if (cart.getTotalCount() > 0) {
        renderCheckoutContent();
      } else {
        closeDrawer();
      }
      return;
    }

    showToast(error.message || 'Lỗi đặt hàng. Vui lòng thử lại.', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      const total = cart.getTotalAmount();
      submitBtn.innerHTML = `🚀 ${activeFulfillmentType === 'DINE_IN' && activePaymentMethod !== 'CASH' ? 'Tiếp tục thanh toán' : activeFulfillmentType === 'DINE_IN' ? 'Đặt dùng tại quán' : 'Đặt giao tận nơi'} · ${formatVND(total)}`;
    }
  }
}

function showPaymentPendingModal(orderData) {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');
  const payment = orderData.payment || {};
  const orderId = orderData.orderId || 'FO-ORDER';
  const actionToken = orderData.actionToken || activeOrderActionToken || getStoredOrderAction(orderId);

  if (!modalOverlay || !drawerContent) return;
  if (paymentPollTimer) clearInterval(paymentPollTimer);

  const mockNotice = payment.isMock
    ? `<div style="background: #fff7ed; color: #9a3412; border: 1px solid #fdba74; padding: 10px; border-radius: 8px; font-size: 12px; margin-top: 12px;">⚠️ QR mô phỏng: ${escapeHTML(payment.message || 'Chưa cấu hình payment provider')}.</div>`
    : '';
  const mockButton = payment.isMock && payment.mockCompletionEnabled
    ? `<button class="btn btn-primary" id="btn-mock-complete-payment" style="width: 100%; margin-top: 12px;">✅ Hoàn thành thanh toán (test)</button>`
    : '';

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="text-align: center; padding: var(--space-3) 0;">
      <h3 style="font-size: var(--font-size-xl); font-weight: 800;">Thanh toán đơn hàng</h3>
      <p style="font-size: 13px; color: var(--color-text-muted); margin-top: 4px;">Đơn #${escapeHTML(orderId)} · ${formatVND(payment.paymentAmount || orderData.total || 0)}</p>
      ${payment.qrImageUrl ? `<img src="${escapeHTML(payment.qrImageUrl)}" alt="QR thanh toán" style="display: block; width: min(280px, 80vw); height: auto; margin: 18px auto 10px; border-radius: 10px; background: white; padding: 8px; border: 1px solid var(--color-border);" />` : ''}
      <div id="payment-waiting-status" style="font-size: 13px; color: var(--color-text-muted);">Đang chờ xác nhận thanh toán...</div>
      ${payment.paymentReference ? `<div style="font-size: 12px; color: var(--color-text-muted); margin-top: 6px;">Mã tham chiếu: <strong>${escapeHTML(payment.paymentReference)}</strong></div>` : ''}
      ${payment.paymentLink ? `<a href="${escapeHTML(payment.paymentLink)}" target="_blank" rel="noopener" class="btn btn-outline" style="display: inline-block; margin-top: 12px;">Mở trang MoMo</a>` : ''}
      ${mockNotice}
      ${mockButton}
      <button class="btn btn-outline" id="btn-cancel-pending-order" style="width: 100%; margin-top: 12px; color: #dc2626; border-color: #fca5a5;">Hủy đơn</button>
      <button class="btn btn-secondary" style="width: 100%; margin-top: 12px;" onclick="closeDrawer()">Đóng</button>
    </div>
  `;

  const finishIfPaid = async () => {
    try {
      const status = await API.get(`/api/orders/${encodeURIComponent(orderId)}`);
      if (status.isPaid === true || status.payment?.paymentStatus === 'PAID') {
        clearInterval(paymentPollTimer);
        paymentPollTimer = null;
        showOrderSuccessModal({ ...orderData, ...status, payment: status.payment }, 'DINE_IN');
      } else if (status.orderStatus === 'CANCELLED') {
        clearInterval(paymentPollTimer);
        paymentPollTimer = null;
        showCancelledOrderModal({ ...orderData, ...status, actionToken });
      }
    } catch (err) {
      console.warn('[Payment Polling]', err.message);
    }
  };

  const mockButtonElement = document.getElementById('btn-mock-complete-payment');
  if (mockButtonElement) {
    mockButtonElement.addEventListener('click', async () => {
      mockButtonElement.disabled = true;
      mockButtonElement.textContent = '⏳ Đang cập nhật...';
      try {
        await API.post(`/api/orders/${encodeURIComponent(orderId)}/payment/mock-complete`, {});
        await finishIfPaid();
      } catch (err) {
        mockButtonElement.disabled = false;
        mockButtonElement.textContent = '✅ Hoàn thành thanh toán (test)';
        showToast(err.message || 'Không thể hoàn thành thanh toán mock', 'error');
      }
    });
  }

  document.getElementById('btn-cancel-pending-order')?.addEventListener('click', async () => {
    if (!actionToken) {
      showToast('Không tìm thấy quyền thao tác đơn hàng. Vui lòng tải lại trang.', 'error');
      return;
    }
    const confirmed = window.confirm('Bạn có chắc muốn hủy đơn này không?');
    if (!confirmed) return;
    const button = document.getElementById('btn-cancel-pending-order');
    if (button) {
      button.disabled = true;
      button.textContent = '⏳ Đang hủy đơn...';
    }
    try {
      const response = await API.post(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { actionToken });
      clearInterval(paymentPollTimer);
      paymentPollTimer = null;
      showCancelledOrderModal({ ...orderData, ...(response.data?.order || {}), actionToken });
    } catch (err) {
      if (button) {
        button.disabled = false;
        button.textContent = 'Hủy đơn';
      }
      showToast(err.message || 'Không thể hủy đơn hàng', 'error');
    }
  });

  paymentPollTimer = window.setInterval(finishIfPaid, 3000);
  modalOverlay.classList.add('active');
}

function showCancelledOrderModal(orderData) {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');
  if (!modalOverlay || !drawerContent) return;
  const orderId = orderData.orderId || orderData.id || 'FO-ORDER';
  const actionToken = orderData.actionToken || activeOrderActionToken || getStoredOrderAction(orderId);
  const total = orderData.total || orderData.totalAmount || orderData.payment?.paymentAmount || 0;

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="text-align: center; padding: var(--space-4) 0;">
      <div style="font-size: 44px; margin-bottom: 10px;">❌</div>
      <h3 style="font-size: var(--font-size-xl); font-weight: 800; color: #dc2626;">Đơn đã hủy</h3>
      <p style="font-size: 13px; color: var(--color-text-muted); margin: 8px 0 20px;">Đơn #${escapeHTML(orderId)} · ${formatVND(total)}</p>
      <button class="btn btn-primary" id="btn-retry-cancelled-order" style="width: 100%;">💳 Thanh toán lại</button>
      <button class="btn btn-secondary" style="width: 100%; margin-top: 12px;" onclick="closeDrawer()">Đóng</button>
    </div>
  `;

  document.getElementById('btn-retry-cancelled-order')?.addEventListener('click', () => {
    showRetryPaymentChooser({ ...orderData, orderId, actionToken });
  });
  modalOverlay.classList.add('active');
}

function showRetryPaymentChooser(orderData) {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');
  if (!modalOverlay || !drawerContent) return;
  const orderId = orderData.orderId || orderData.id;
  const actionToken = orderData.actionToken || activeOrderActionToken || getStoredOrderAction(orderId);
  let retryPaymentMethod = orderData.payment?.paymentMethod || activePaymentMethod || 'CASH';

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="padding: var(--space-3) 0;">
      <h3 style="font-size: var(--font-size-xl); font-weight: 800;">Thanh toán lại đơn hàng</h3>
      <p style="font-size: 13px; color: var(--color-text-muted); margin: 6px 0 18px;">Đơn #${escapeHTML(orderId)} · Hình thức: 🍽️ Dùng tại quán</p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${[
          ['CASH', '💵', 'Tiền mặt tại quán', 'Thanh toán trực tiếp với nhân viên'],
          ['BANK_QR', '🏦', 'QR ngân hàng', 'Quét mã theo đúng số tiền'],
          ['MOMO_QR', '🟣', 'QR MoMo', 'MoMo Merchant hoặc QR test']
        ].map(([value, icon, title, desc]) => `
          <label class="fulfillment-option ${retryPaymentMethod === value ? 'is-selected' : ''}" data-retry-payment="${value}" style="padding: 10px 12px;">
            <input type="radio" name="retryPaymentMethod" value="${value}" ${retryPaymentMethod === value ? 'checked' : ''} />
            <div class="fulfillment-card-content"><span class="fulfillment-icon">${icon}</span><div class="fulfillment-text"><span class="fulfillment-title">${title}</span><span class="fulfillment-desc">${desc}</span></div><span class="fulfillment-check">✓</span></div>
          </label>
        `).join('')}
      </div>
      <button class="btn btn-primary" id="btn-submit-retry-payment" style="width: 100%; margin-top: 18px;">Tiếp tục</button>
      <button class="btn btn-secondary" style="width: 100%; margin-top: 12px;" onclick="closeDrawer()">Đóng</button>
    </div>
  `;

  document.querySelectorAll('input[name="retryPaymentMethod"]').forEach(input => {
    input.addEventListener('change', () => {
      retryPaymentMethod = input.value;
      document.querySelectorAll('[data-retry-payment]').forEach(option => option.classList.remove('is-selected'));
      input.closest('[data-retry-payment]')?.classList.add('is-selected');
    });
  });

  document.getElementById('btn-submit-retry-payment')?.addEventListener('click', async () => {
    const button = document.getElementById('btn-submit-retry-payment');
    if (button) {
      button.disabled = true;
      button.textContent = '⏳ Đang tạo đơn thanh toán lại...';
    }
    try {
      const response = await API.post(`/api/orders/${encodeURIComponent(orderId)}/retry`, {
        actionToken,
        paymentMethod: retryPaymentMethod
      });
      const newOrder = response.data;
      saveOrderAction(newOrder.orderId, newOrder.actionToken);
      if (newOrder.payment?.paymentStatus === 'PENDING') {
        showPaymentPendingModal(newOrder);
      } else {
        showOrderSuccessModal(newOrder, 'DINE_IN');
      }
    } catch (err) {
      if (button) {
        button.disabled = false;
        button.textContent = 'Tiếp tục';
      }
      showToast(err.message || 'Không thể tạo lại đơn hàng', 'error');
    }
  });
  modalOverlay.classList.add('active');
}

function showOrderSuccessModal(orderData, fulfillmentType = 'DELIVERY', deliveryAddress = '') {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  const isDineIn = (orderData.fulfillmentType || fulfillmentType) === 'DINE_IN';
  const isUnpaid = isDineIn && orderData.isPaid !== true && orderData.payment?.paymentStatus !== 'PAID';
  const actionToken = orderData.actionToken || activeOrderActionToken || getStoredOrderAction(orderData.orderId);

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="text-align: center; padding: var(--space-4) 0;">
      <div style="width: 64px; height: 64px; background-color: var(--color-secondary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto var(--space-4) auto;">
        ✓
      </div>
      <h3 style="font-size: var(--font-size-2xl); font-weight: 800; color: var(--color-secondary);">Đặt hàng thành công!</h3>
      <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-top: 4px;">Đơn hàng của bạn đã được tiếp nhận và xác nhận.</p>
      
      <div style="background-color: var(--color-bg-alt); padding: var(--space-4); border-radius: var(--radius-lg); margin: var(--space-6) 0; text-align: left;">
        <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm); margin-bottom: 8px;">
          <span style="color: var(--color-text-muted);">Mã đơn hàng:</span>
          <strong style="color: var(--color-primary);">${escapeHTML(orderData.orderId || 'FO-ORDER')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm); margin-bottom: 8px;">
          <span style="color: var(--color-text-muted);">Hình thức:</span>
          <strong style="color: var(--color-text-main);">${isDineIn ? '🍽️ Dùng tại quán' : '🛵 Giao tận nơi'}</strong>
        </div>
        ${!isDineIn && deliveryAddress ? `
          <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm); margin-bottom: 8px;">
            <span style="color: var(--color-text-muted);">Địa chỉ nhận:</span>
            <span style="font-weight: 600; max-width: 60%; text-align: right;">${escapeHTML(deliveryAddress)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm);">
          <span style="color: var(--color-text-muted);">Trạng thái:</span>
          <span class="badge badge-active">${escapeHTML(orderData.status || 'CONFIRMED')}</span>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button class="btn btn-outline" id="btn-copy-order-code" style="flex: 1; font-size: 13px;">📋 Sao chép mã đơn</button>
      </div>

      ${isUnpaid ? `<button class="btn btn-outline" id="btn-cancel-unpaid-order" style="width: 100%; margin-bottom: 12px; color: #dc2626; border-color: #fca5a5;">Hủy đơn</button>` : ''}
      <button class="btn btn-primary" style="width: 100%;" onclick="closeDrawer()">🍲 Tiếp tục chọn món</button>
    </div>
  `;

  document.getElementById('btn-copy-order-code')?.addEventListener('click', () => {
    const code = orderData.orderId || 'FO-ORDER';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => showToast('Đã sao chép mã đơn hàng!', 'success'));
    } else {
      showToast(`Mã đơn: ${code}`, 'info');
    }
  });

  document.getElementById('btn-cancel-unpaid-order')?.addEventListener('click', async () => {
    if (!actionToken) return showToast('Không tìm thấy quyền thao tác đơn hàng.', 'error');
    if (!window.confirm('Bạn có chắc muốn hủy đơn này không?')) return;
    try {
      const response = await API.post(`/api/orders/${encodeURIComponent(orderData.orderId)}/cancel`, { actionToken });
      showCancelledOrderModal({ ...orderData, ...(response.data?.order || {}), actionToken });
    } catch (err) {
      showToast(err.message || 'Không thể hủy đơn hàng', 'error');
    }
  });

  modalOverlay.classList.add('active');
}
