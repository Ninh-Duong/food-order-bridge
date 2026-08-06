/**
 * Food Order Bridge - Checkout & Order Submission Logic
 */
import { API } from '../common/api.js';
import { formatVND, showToast } from '../common/utils.js';
import { cart } from './cart.js';
import { closeDrawer } from './quick-view-drawer.js';

export function setupCheckoutModal() {
  const checkoutBtn = document.getElementById('btn-open-checkout');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', openCheckoutDrawer);
  }
}

function openCheckoutDrawer() {
  const modalOverlay = document.getElementById('modal-overlay');
  const drawerContent = document.getElementById('drawer-content');

  if (!modalOverlay || !drawerContent) return;

  const count = cart.getTotalCount();
  const total = cart.getTotalAmount();

  if (count === 0) {
    showToast('Giỏ hàng của bạn đang trống!', 'error');
    return;
  }

  drawerContent.innerHTML = `
    <div class="drawer-drag-handle"></div>
    <h3 style="font-size: var(--font-size-xl); font-weight: 800; margin-bottom: var(--space-4);">Xác nhận đặt hàng</h3>

    <div style="background-color: var(--color-bg-alt); padding: var(--space-4); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
      <h4 style="font-size: var(--font-size-sm); font-weight: 700; margin-bottom: var(--space-2);">Món đã chọn (${count})</h4>
      <div style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
        ${Array.from(cart.items.values()).map(entry => `
          <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm);">
            <span>${entry.quantity} × ${entry.item.name}</span>
            <span style="font-weight: 700;">${formatVND(entry.item.price * entry.quantity)}</span>
          </div>
        `).join('')}
      </div>
      <div style="border-top: 1px dashed var(--color-border); margin-top: var(--space-3); padding-top: var(--space-2); display: flex; justify-content: space-between; font-weight: 800; font-size: var(--font-size-base);">
        <span>Tổng cộng</span>
        <span style="color: var(--color-primary);">${formatVND(total)}</span>
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
        <input type="text" id="cust-note" class="form-control" placeholder="VD: Không lấy hành, ít cay..." />
      </div>

      <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: var(--space-4);" id="btn-submit-order">
        🚀 Gửi đơn hàng (${formatVND(total)})
      </button>
    </form>
  `;

  modalOverlay.classList.add('active');

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

  // Client-side UUID requestId generation for idempotency & deduplication
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random()}`;

  const payload = {
    requestId,
    customer: { name, phone, address, note },
    items: cart.getPayloadItems()
  };

  try {
    const response = await API.post('/api/orders', payload);
    const orderData = response.data;

    cart.clear();
    closeDrawer();

    showOrderSuccessModal(orderData);
  } catch (error) {
    showToast(error.message || 'Lỗi đặt hàng. Vui lòng thử lại.', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Gửi đơn hàng';
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
      <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-top: 4px;">Đơn hàng của bạn đã được chuyển tới nhóm Telegram của cửa hàng.</p>
      
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
          <span style="font-weight: 600;">${orderData.notificationStatus === 'SENT' ? '🟢 Đã gửi nhóm' : '🟡 Đã ghi nhận'}</span>
        </div>
      </div>

      <button class="btn btn-primary" style="width: 100%;" onclick="closeDrawer()">Hoàn tất</button>
    </div>
  `;

  modalOverlay.classList.add('active');
}
