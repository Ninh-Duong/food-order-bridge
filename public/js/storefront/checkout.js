/**
 * Food Order Bridge - Checkout & Order Submission Logic with Revalidation, Line Options & Idempotency
 */
import { API } from '../common/api.js';
import { formatVND, showToast, escapeHTML } from '../common/utils.js';
import { cart } from './cart.js';
import { closeDrawer } from './quick-view-drawer.js';

let activeCheckoutRequestId = null;
let lastPayloadFingerprint = null;

function generateRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getPayloadFingerprint(items) {
  return JSON.stringify(
    items.map(i => ({ p: i.productId, q: i.quantity, ex: (i.excludedOptionIds || []).sort() })).sort((a, b) => a.p.localeCompare(b.p))
  );
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

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <h3 style="font-size: var(--font-size-xl); font-weight: 800; margin-bottom: var(--space-4);">Xác nhận đặt hàng</h3>

    <div style="background-color: var(--color-bg-alt); padding: var(--space-4); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
      <h4 style="font-size: var(--font-size-sm); font-weight: 700; margin-bottom: var(--space-2);">Món đã chọn (${count})</h4>
      
      <div id="checkout-items-list" style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px;">
        ${cartEntries.map(entry => {
          const origPrice = Number(entry.item.price) || 0;
          const salePrice = entry.item.salePrice !== undefined ? entry.item.salePrice : calculateSalePriceClient(origPrice, entry.item.discountPercent);
          const lineTotal = salePrice * entry.quantity;

          // Resolve excluded option names from item customizationOptions
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

    <form id="checkout-form">
      <div class="form-group">
        <label class="form-label" for="cust-name">Họ và tên *</label>
        <input type="text" id="cust-name" class="form-control" placeholder="VD: Nguyễn Văn A" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="cust-phone">Số điện thoại *</label>
        <input type="tel" id="cust-phone" class="form-control" placeholder="VD: 0901234567" required pattern="^[0-9]{10,11}$" />
      </div>

      <div class="form-group">
        <label class="form-label" for="cust-address">Địa chỉ giao hàng *</label>
        <input type="text" id="cust-address" class="form-control" placeholder="VD: 12 Nguyễn Trãi, P.5, Q.5" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="cust-note">Ghi chú cho cửa hàng</label>
        <input type="text" id="cust-note" class="form-control" placeholder="VD: Giao trước 19:15, gói riêng nước..." />
      </div>

      <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: var(--space-4);" id="btn-submit-order">
        🚀 Gửi đơn hàng (${formatVND(total)})
      </button>
    </form>
  `;

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

  const form = document.getElementById('checkout-form');
  if (form) {
    form.addEventListener('submit', handleOrderSubmit);
  }
}

async function handleOrderSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('btn-submit-order');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý đơn hàng...';
  }

  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  const note = document.getElementById('cust-note').value.trim();

  const currentPayloadItems = cart.getPayloadItems();
  const currentFingerprint = getPayloadFingerprint(currentPayloadItems);

  if (!activeCheckoutRequestId || lastPayloadFingerprint !== currentFingerprint) {
    activeCheckoutRequestId = generateRequestId();
    lastPayloadFingerprint = currentFingerprint;
  }

  const payload = {
    requestId: activeCheckoutRequestId,
    customer: { name, phone, address, note },
    items: currentPayloadItems
  };

  try {
    const response = await API.post('/api/orders', payload);
    const orderData = response.data;

    activeCheckoutRequestId = null;
    lastPayloadFingerprint = null;

    cart.clear();
    closeDrawer();

    showOrderSuccessModal(orderData);
  } catch (error) {
    if (error.code === 'INSUFFICIENT_STOCK' || error.status === 409) {
      showToast(error.message || 'Món ăn trong giỏ hàng đã thay đổi tồn kho!', 'error');

      try {
        const menuRes = await API.get('/api/menu');
        const latestItems = menuRes.items || [];
        cart.reconcileWithMenu(latestItems);
      } catch (e) {}

      activeCheckoutRequestId = generateRequestId();
      lastPayloadFingerprint = getPayloadFingerprint(cart.getPayloadItems());

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
      submitBtn.textContent = `🚀 Gửi đơn hàng (${formatVND(cart.getTotalAmount())})`;
    }
  }
}

function showOrderSuccessModal(orderData) {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <div style="text-align: center; padding: var(--space-4) 0;">
      <div style="width: 64px; height: 64px; background-color: var(--color-secondary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto var(--space-4) auto;">
        ✓
      </div>
      <h3 style="font-size: var(--font-size-2xl); font-weight: 800; color: var(--color-secondary);">Đặt hàng thành công!</h3>
      <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-top: 4px;">Đơn hàng của bạn đã được chuyển tới phiếu bếp Telegram của cửa hàng.</p>
      
      <div style="background-color: var(--color-bg-alt); padding: var(--space-4); border-radius: var(--radius-lg); margin: var(--space-6) 0; text-align: left;">
        <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm); margin-bottom: 8px;">
          <span style="color: var(--color-text-muted);">Mã đơn hàng:</span>
          <strong style="color: var(--color-primary);">${orderData.orderId || 'FO-ORDER'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm); margin-bottom: 8px;">
          <span style="color: var(--color-text-muted);">Trạng thái:</span>
          <span class="badge badge-active">${orderData.status || 'CONFIRMED'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm);">
          <span style="color: var(--color-text-muted);">Thông báo Telegram:</span>
          <span style="font-weight: 600;">${orderData.notificationStatus === 'SENT' ? '🟢 Đã gửi phiếu bếp' : '🟡 Đã ghi nhận'}</span>
        </div>
      </div>

      <button class="btn btn-primary" style="width: 100%;" onclick="closeDrawer()">Hoàn tất</button>
    </div>
  `;

  modalOverlay.classList.add('active');
}
