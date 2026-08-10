/**
 * Food Order Bridge - Checkout & Order Submission Logic
 * Supports DELIVERY & DINE_IN fulfillment options, strict VN phone validation,
 * recent delivery addresses, and geolocation assistance.
 */
import { API } from '../common/api.js';
import { formatVND, showToast, escapeHTML } from '../common/utils.js';
import { cart } from './cart.js';
import { closeDrawer } from './quick-view-drawer.js';

let activeCheckoutRequestId = null;
let lastPayloadFingerprint = null;
let activeFulfillmentType = 'DELIVERY'; // 'DELIVERY' | 'DINE_IN'

const RECENT_ADDRESS_KEY = 'food_order_recent_addresses';

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

  if (!modalOverlay || !drawerContent) return;

  if (cart.getTotalCount() === 0) {
    showToast('Giỏ hàng của bạn đang trống!', 'error');
    return;
  }

  // Revalidate menu before opening checkout
  try {
    const menuRes = await API.get('/api/menu');
    const latestItems = menuRes.items || [];
    cart.reconcileWithMenu(latestItems);
  } catch (err) {
    console.warn('Revalidation fetch failed:', err.message);
  }

  const count = cart.getTotalCount();
  if (count === 0) {
    showToast('Tất cả món trong giỏ hàng hiện đã hết hàng hoặc ngưng bán.', 'error');
    return;
  }

  renderCheckoutContent();
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
      <div class="form-group">
        <label class="form-label" for="cust-name">Họ và tên *</label>
        <input type="text" id="cust-name" class="form-control" placeholder="VD: Nguyễn Văn A" required />
        <div class="field-error" id="err-cust-name" style="display: none;"></div>
      </div>

      <div class="form-group">
        <label class="form-label" for="cust-phone">Số điện thoại *</label>
        <input type="tel" id="cust-phone" class="form-control" placeholder="VD: 0901234567" inputmode="numeric" autocomplete="tel" maxlength="10" required />
        <div class="field-error" id="err-cust-phone" style="display: none;">Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.</div>
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
    const submitBtn = document.getElementById('btn-submit-order');

    if (type === 'DELIVERY') {
      if (optionDelivery) optionDelivery.classList.add('is-selected');
      if (optionDineIn) optionDineIn.classList.remove('is-selected');
      if (addressSection) addressSection.style.display = 'block';
      if (addressInput) addressInput.setAttribute('required', 'true');
      if (submitBtn) submitBtn.innerHTML = `🚀 Đặt giao tận nơi · ${formatVND(cart.getTotalAmount())}`;
    } else {
      if (optionDineIn) optionDineIn.classList.add('is-selected');
      if (optionDelivery) optionDelivery.classList.remove('is-selected');
      if (addressSection) addressSection.style.display = 'none';
      if (addressInput) addressInput.removeAttribute('required');
      if (errAddress) errAddress.style.display = 'none';
      if (submitBtn) submitBtn.innerHTML = `🚀 Đặt dùng tại quán · ${formatVND(cart.getTotalAmount())}`;
    }
  };

  if (radioDelivery) {
    radioDelivery.addEventListener('change', () => updateFulfillmentUI('DELIVERY'));
  }
  if (radioDineIn) {
    radioDineIn.addEventListener('change', () => updateFulfillmentUI('DINE_IN'));
  }

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

  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    if (errName) {
      errName.textContent = 'Vui lòng nhập họ và tên.';
      errName.style.display = 'block';
    }
    hasError = true;
  }

  const phoneRaw = phoneInput ? phoneInput.value : '';
  const phone = phoneRaw.replace(/[\s.-]/g, '');
  if (!/^0\d{9}$/.test(phone)) {
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
    customer: { name, phone, address, note },
    items: currentPayloadItems
  };

  try {
    const response = await API.post('/api/orders', payload);
    const orderData = response.data;

    if (activeFulfillmentType === 'DELIVERY' && address) {
      saveRecentAddress(address);
    }

    activeCheckoutRequestId = null;
    lastPayloadFingerprint = null;

    cart.clear();
    closeDrawer();

    showOrderSuccessModal(orderData, activeFulfillmentType, address);
  } catch (error) {
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
      submitBtn.innerHTML = `🚀 ${activeFulfillmentType === 'DINE_IN' ? 'Đặt dùng tại quán' : 'Đặt giao tận nơi'} · ${formatVND(total)}`;
    }
  }
}

function showOrderSuccessModal(orderData, fulfillmentType = 'DELIVERY', deliveryAddress = '') {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  const isDineIn = (orderData.fulfillmentType || fulfillmentType) === 'DINE_IN';

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

      <button class="btn btn-primary" style="width: 100%;" onclick="closeDrawer()">Hoàn tất</button>
    </div>
  `;

  modalOverlay.classList.add('active');
}
