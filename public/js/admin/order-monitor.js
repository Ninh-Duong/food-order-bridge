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

export async function initOrderMonitor() {
  await fetchOrders();

  const refreshBtn = document.getElementById('btn-refresh-orders');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchOrders);
  }

  bindOrderTableEvents();
  bindInvoicePreviewEvents();
  bindAfterPrintEvent();
}

async function fetchOrders() {
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  try {
    const data = await API.get('/api/orders');
    adminOrdersList = data.orders || [];
    renderOrdersTable(adminOrdersList);
  } catch (error) {
    showToast('Lỗi tải danh sách đơn hàng', 'error');
  }
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

    return `
      <tr>
        <td><strong style="color: var(--color-primary);">${safeOrderId}</strong></td>
        <td>
          <strong>${escapeHTML(order.customer?.name || 'Khách lẻ')}</strong>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${escapeHTML(order.customer?.phone || '')}</div>
        </td>
        <td style="font-size: var(--font-size-xs); max-width: 180px;" class="line-clamp-2">${escapeHTML(order.customer?.address || '')}</td>
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
          <span class="badge ${order.notificationStatus === 'SENT' ? 'badge-active' : 'badge-inactive'}">
            ${order.notificationStatus === 'SENT' ? '🟢 Telegram OK' : '🔴 Lỗi Telegram'}
          </span>
        </td>
        <td style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${new Date(order.createdAt).toLocaleTimeString('vi-VN')}</td>
        <td>
          <button type="button" class="btn btn-outline btn-print-invoice" style="min-height: 30px; padding: 2px 8px; font-size: 12px;" data-action="print-invoice" data-order-id="${safeOrderId}">
            🖨 In hóa đơn
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function bindOrderTableEvents() {
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="print-invoice"]');
    if (!button) return;

    const orderId = button.dataset.orderId;
    if (orderId) {
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
