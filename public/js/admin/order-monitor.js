/**
 * Food Order Bridge - Admin Order Monitor & Invoice Printing
 */
import { API } from '../common/api.js';
import { formatVND, showToast, escapeHTML } from '../common/utils.js';
import { renderInvoiceHTML } from './invoice-renderer.js';

let adminOrdersList = [];
let selectedInvoiceOrderId = null;
let printInProgress = false;
let lastFocusedElement = null;

let currentPage = 1;
let pageSize = 10;
let paginationState = { page: 1, limit: 10, totalOrders: 0, totalPages: 1 };

export function formatOrderDateTime(value) {
  if (!value) return { dateText: '—', timeText: '', fullText: '—' };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { dateText: '—', timeText: '', fullText: '—' };

  try {
    const parts = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(d);
    const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const dateText = `${values.day}/${values.month}/${values.year}`;
    const timeText = `${values.hour}:${values.minute}`;
    return {
      dateText,
      timeText,
      fullText: `${dateText} ${timeText}`
    };
  } catch (e) {
    const dateText = d.toLocaleDateString('vi-VN');
    const timeText = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return {
      dateText,
      timeText,
      fullText: `${dateText} ${timeText}`
    };
  }
}

export async function initOrderMonitor() {
  await fetchOrders(1, pageSize);

  const refreshBtn = document.getElementById('btn-refresh-orders');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => fetchOrders(currentPage, pageSize));
  }

  const pageSizeSelect = document.getElementById('orders-page-size');
  if (pageSizeSelect) {
    pageSizeSelect.value = String(pageSize);
    pageSizeSelect.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10) || 10;
      currentPage = 1;
      fetchOrders(1, pageSize);
    });
  }

  bindOrderTableEvents();
  bindInvoicePreviewEvents();
  bindAfterPrintEvent();
}

async function fetchOrders(page = currentPage, limit = pageSize) {
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  try {
    const data = await API.get(`/api/orders?page=${page}&limit=${limit}`);
    adminOrdersList = data.orders || [];
    if (data.pagination) {
      paginationState = data.pagination;
      currentPage = data.pagination.page;
      pageSize = data.pagination.limit;
    }
    renderOrdersTable(adminOrdersList);
    renderPaginationControls();
  } catch (error) {
    showToast('Lỗi tải danh sách đơn hàng', 'error');
  }
}

function renderPaginationControls() {
  const infoEl = document.getElementById('orders-pagination-info');
  const btnsEl = document.getElementById('orders-pagination-btns');
  if (!infoEl || !btnsEl) return;

  const { page, limit, totalOrders, totalPages } = paginationState;

  if (totalOrders === 0) {
    infoEl.textContent = 'Chưa có đơn hàng nào';
    btnsEl.innerHTML = '';
    return;
  }

  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, totalOrders);

  infoEl.innerHTML = `Hiển thị <strong>${startRecord} - ${endRecord}</strong> / <strong>${totalOrders}</strong> đơn hàng (Trang ${page}/${totalPages})`;

  let btnsHtml = `
    <button class="btn btn-secondary" style="min-height: 30px; padding: 2px 10px; font-size: 12px;" id="btn-prev-page" ${page <= 1 ? 'disabled' : ''}>
      ◀ Trước
    </button>
  `;

  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const isCurrent = p === page;
    btnsHtml += `
      <button class="btn ${isCurrent ? 'btn-primary' : 'btn-secondary'}" style="min-height: 30px; min-width: 30px; padding: 0 4px; font-size: 12px; font-weight: 700;" data-page="${p}">
        ${p}
      </button>
    `;
  }

  btnsHtml += `
    <button class="btn btn-secondary" style="min-height: 30px; padding: 2px 10px; font-size: 12px;" id="btn-next-page" ${page >= totalPages ? 'disabled' : ''}>
      Sau ▶
    </button>
  `;

  btnsEl.innerHTML = btnsHtml;

  const prevBtn = document.getElementById('btn-prev-page');
  if (prevBtn) {
    prevBtn.onclick = () => fetchOrders(page - 1, pageSize);
  }

  const nextBtn = document.getElementById('btn-next-page');
  if (nextBtn) {
    nextBtn.onclick = () => fetchOrders(page + 1, pageSize);
  }

  btnsEl.querySelectorAll('[data-page]').forEach(btn => {
    btn.onclick = () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p !== page) fetchOrders(p, pageSize);
    };
  });
}


function renderOrdersTable(orders) {
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  if (orders.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--color-text-muted);">Chưa có đơn hàng nào được ghi nhận.</td></tr>`;
    return;
  }

  tableBody.innerHTML = orders.map(order => {
    const discount = order.discountAmount || 0;
    const safeOrderId = escapeHTML(order.id);
    const isPaid = order.isPaid === true;

    const fulfillmentType = order.fulfillmentType || 'DELIVERY';
    const isDineIn = fulfillmentType === 'DINE_IN';

    const fulfillmentCellHtml = isDineIn ? `
      <div>
        <span class="badge fulfillment-badge fulfillment-dine-in">🍽️ Dùng tại quán</span>
        <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: 4px;">Không yêu cầu địa chỉ</div>
      </div>
    ` : `
      <div>
        <span class="badge fulfillment-badge fulfillment-delivery">🛵 Giao tận nơi</span>
        <div style="font-size: var(--font-size-xs); max-width: 200px; margin-top: 4px;" class="line-clamp-2" title="${escapeHTML(order.customer?.address || '')}">
          ${escapeHTML(order.customer?.address || '')}
        </div>
      </div>
    `;

    const dt = formatOrderDateTime(order.createdAt);
    const dateCellHtml = `
      <div class="order-date-cell" title="${escapeHTML(dt.fullText)}">
        <div style="font-weight: 600; color: var(--color-text-main); font-size: var(--font-size-xs);">${escapeHTML(dt.dateText)}</div>
        <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">${escapeHTML(dt.timeText)}</div>
      </div>
    `;

    const itemsHtml = (order.items || []).map(i => {
      const hasDiscount = i.discountPercent > 0 && i.originalUnitPrice > i.unitPrice;
      const excludedOpts = i.customization?.excludedOptions || [];
      const hasExclusions = excludedOpts.length > 0;

      let customText = '';
      if (hasExclusions) {
        const names = excludedOpts.map(o => escapeHTML(o.name));
        customText = `<div style="font-size: 11px; font-weight: 700; color: #dc2626;">KHÔNG LẤY: ${names.join(', ')}</div>`;
      }

      return `
        <li style="margin-bottom: 6px;">
          <strong>${i.quantity} × ${escapeHTML(i.name || i.productId)}</strong>
          ${customText}
          <div style="font-size: 11px; color: var(--color-text-muted);">
            ${hasDiscount ? `<span style="text-decoration: line-through;">${formatVND(i.originalUnitPrice)}</span> → <strong style="color: var(--color-accent-spicy);">${formatVND(i.unitPrice)}</strong> (-${i.discountPercent}%)` : `${formatVND(i.unitPrice || i.originalUnitPrice)}/phần`}
          </div>
        </li>
      `;
    }).join('');

    const paymentBtnHtml = isPaid ? `
      <button type="button" class="btn btn-secondary btn-payment-toggle" style="min-height: 28px; padding: 2px 8px; font-size: 11px; background: rgba(16, 185, 129, 0.15); color: #059669; border-color: rgba(16, 185, 129, 0.4); font-weight: 700;" data-action="toggle-payment" data-order-id="${safeOrderId}" data-current-paid="true" title="Bấm để chuyển về Chưa thanh toán">
        ✓ Đã thanh toán
      </button>
    ` : `
      <button type="button" class="btn btn-secondary btn-payment-toggle" style="min-height: 28px; padding: 2px 8px; font-size: 11px; background: rgba(239, 68, 68, 0.1); color: #dc2626; border-color: rgba(239, 68, 68, 0.3); font-weight: 700;" data-action="toggle-payment" data-order-id="${safeOrderId}" data-current-paid="false" title="Bấm để xác nhận Đã thanh toán">
        ○ Chưa thanh toán
      </button>
    `;

    const printBtnHtml = isPaid ? `
      <button type="button" class="btn btn-outline btn-print-invoice" style="min-height: 30px; padding: 2px 8px; font-size: 12px;" data-action="print-invoice" data-order-id="${safeOrderId}">
        🖨 In hóa đơn
      </button>
    ` : `
      <button type="button" class="btn btn-outline btn-print-invoice" style="min-height: 30px; padding: 2px 8px; font-size: 12px; opacity: 0.4; cursor: not-allowed;" disabled aria-disabled="true" title="Chỉ được in hóa đơn sau khi thanh toán" data-action="print-invoice" data-order-id="${safeOrderId}">
        🖨 In hóa đơn
      </button>
    `;

    return `
      <tr>
        <td><strong style="color: var(--color-primary);">${safeOrderId}</strong></td>
        <td>
          <strong>${escapeHTML(order.customer?.name || 'Khách lẻ')}</strong>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${escapeHTML(order.customer?.phone || '')}</div>
        </td>
        <td>${fulfillmentCellHtml}</td>
        <td>
          <ul style="font-size: var(--font-size-xs); padding-left: 12px; margin: 0;">
            ${itemsHtml}
          </ul>
        </td>
        <td>
          <div style="font-weight: 800; color: var(--color-primary); font-size: var(--font-size-sm);">${formatVND(order.totalAmount)}</div>
          ${discount > 0 ? `
            <div style="font-size: 11px; color: var(--color-accent-spicy);">Giảm: -${formatVND(discount)}</div>
          ` : ''}
        </td>
        <td>
          ${paymentBtnHtml}
        </td>
        <td>${dateCellHtml}</td>
        <td>
          ${printBtnHtml}
        </td>
      </tr>
    `;
  }).join('');
}

function bindOrderTableEvents() {
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  tableBody.addEventListener('click', async (event) => {
    // Payment Toggle Handler
    const paymentBtn = event.target.closest('[data-action="toggle-payment"]');
    if (paymentBtn) {
      const orderId = paymentBtn.dataset.orderId;
      const currentPaid = paymentBtn.dataset.currentPaid === 'true';
      const targetPaid = !currentPaid;

      if (currentPaid) {
        const confirmed = window.confirm(`Bỏ trạng thái thanh toán của đơn ${orderId}? Đơn này sẽ không còn được tính trong báo cáo.`);
        if (!confirmed) return;
      }

      paymentBtn.disabled = true;
      paymentBtn.textContent = '⏳ ...';

      try {
        const resData = await API.put(`/api/orders/${orderId}/payment`, { isPaid: targetPaid });
        const updated = resData.order || resData;

        const idx = adminOrdersList.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          adminOrdersList[idx] = { ...adminOrdersList[idx], ...updated };
        }

        renderOrdersTable(adminOrdersList);
        document.dispatchEvent(new CustomEvent('paymentStatusUpdated', {
          detail: { orderId, isPaid: targetPaid }
        }));
        showToast(targetPaid ? 'Đã xác nhận thanh toán đơn hàng' : 'Đã chuyển đơn hàng về chưa thanh toán', 'success');
      } catch (err) {
        console.error('[Payment Toggle Error]:', err);
        showToast(err.message || 'Lỗi cập nhật trạng thái thanh toán', 'error');
        renderOrdersTable(adminOrdersList);
      }
      return;
    }

    // Invoice Print Handler
    const printBtn = event.target.closest('[data-action="print-invoice"]');
    if (printBtn) {
      const orderId = printBtn.dataset.orderId;
      const order = adminOrdersList.find(o => o.id === orderId);
      if (!order || !order.isPaid) {
        showToast('Đơn hàng chưa thanh toán nên chưa thể in hóa đơn', 'warning');
        return;
      }
      openInvoicePreview(orderId);
    }
  });
}

function bindInvoicePreviewEvents() {
  const closeBtn = document.getElementById('btn-close-invoice-preview');
  const cancelBtn = document.getElementById('btn-cancel-invoice-print');
  const confirmBtn = document.getElementById('btn-confirm-invoice-print');
  const overlay = document.getElementById('invoice-preview-overlay');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeInvoicePreview);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeInvoicePreview);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener('click', printCurrentInvoice);
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeInvoicePreview();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) {
      closeInvoicePreview();
    }
  });
}

function bindAfterPrintEvent() {
  window.addEventListener('afterprint', () => {
    restorePrintState();
  });
}

export function openInvoicePreview(orderId) {
  const order = adminOrdersList.find(o => o.id === orderId);
  if (!order) {
    showToast('Không tìm thấy thông tin đơn hàng để in', 'error');
    return;
  }

  if (!order.isPaid) {
    showToast('Đơn hàng chưa thanh toán nên chưa thể in hóa đơn', 'warning');
    return;
  }

  selectedInvoiceOrderId = orderId;
  lastFocusedElement = document.activeElement;

  const printableContainer = document.getElementById('printable-invoice');
  if (printableContainer) {
    printableContainer.innerHTML = renderInvoiceHTML(order);
  }

  const overlay = document.getElementById('invoice-preview-overlay');
  if (overlay) {
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('invoice-modal-open');

    const confirmBtn = document.getElementById('btn-confirm-invoice-print');
    if (confirmBtn) {
      confirmBtn.focus();
    }
  }
}

export function closeInvoicePreview() {
  if (printInProgress) return;

  const overlay = document.getElementById('invoice-preview-overlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  document.body.classList.remove('invoice-modal-open');
  selectedInvoiceOrderId = null;

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

export function printCurrentInvoice() {
  if (!selectedInvoiceOrderId || printInProgress) return;

  const order = adminOrdersList.find(o => o.id === selectedInvoiceOrderId);
  if (!order || !order.isPaid) {
    showToast('Đơn hàng chưa thanh toán nên chưa thể in hóa đơn', 'warning');
    closeInvoicePreview();
    return;
  }

  printInProgress = true;

  printInProgress = true;
  document.body.classList.add('is-printing-invoice');

  const confirmBtn = document.getElementById('btn-confirm-invoice-print');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Đang mở hộp thoại in...';
  }

  requestAnimationFrame(() => {
    window.print();

    // Fallback cleanup if browser doesn't trigger afterprint event
    setTimeout(() => {
      if (printInProgress) {
        restorePrintState();
      }
    }, 2000);
  });
}

function restorePrintState() {
  document.body.classList.remove('is-printing-invoice');
  printInProgress = false;

  const confirmBtn = document.getElementById('btn-confirm-invoice-print');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '🖨 In ngay';
  }
}
