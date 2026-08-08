/**
 * Food Order Bridge - Admin Invoice HTML Renderer
 */
import { formatVND, escapeHTML } from '../common/utils.js';

/**
 * Generates semantic, printable HTML string for an order invoice.
 * @param {Object} order - Order object snapshot
 * @param {Object} [settings={}] - Shop settings (shopName, shopAddress, shopPhone)
 * @returns {string} HTML string representing the formatted invoice
 */
export function renderInvoiceHTML(order, settings = {}) {
  if (!order) return '<div class="invoice-empty">Không có dữ liệu đơn hàng.</div>';

  const shopName = escapeHTML(settings.shopName || 'FOOD ORDER BRIDGE');
  const shopAddress = settings.shopAddress ? escapeHTML(settings.shopAddress) : '';
  const shopPhone = settings.shopPhone ? escapeHTML(settings.shopPhone) : '';

  const safeOrderId = escapeHTML(order.id || 'N/A');

  // Date parsing with safe fallback
  let dateStr = 'Không xác định';
  let timeStr = '';
  if (order.createdAt) {
    const d = new Date(order.createdAt);
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString('vi-VN');
      timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
  }

  const customerName = escapeHTML(order.customer?.name || order.customerName || 'Khách lẻ');
  const customerPhone = escapeHTML(order.customer?.phone || order.phone || '');
  const customerAddress = escapeHTML(order.customer?.address || order.address || '');
  const customerNote = escapeHTML(order.customer?.note || order.note || '');

  const items = Array.isArray(order.items) ? order.items : [];

  let itemsHtml = '';
  if (items.length === 0) {
    itemsHtml = '<div class="invoice-empty-items">Không có dữ liệu món ăn.</div>';
  } else {
    itemsHtml = items.map((item, idx) => {
      const name = escapeHTML(item.name || item.productId || 'Món ăn');
      const qty = item.quantity ?? 1;

      // Safe fallback for pricing attributes using nullish coalescing
      const unitPrice = item.unitPrice ?? item.originalUnitPrice ?? 0;
      const originalUnitPrice = item.originalUnitPrice ?? unitPrice;
      const discountPercent = item.discountPercent ?? 0;
      const itemTotal = item.itemTotal ?? (unitPrice * qty);

      const hasDiscount = discountPercent > 0 && originalUnitPrice > unitPrice;
      const excludedOpts = item.customization?.excludedOptions || [];
      const hasExclusions = Array.isArray(excludedOpts) && excludedOpts.length > 0;

      let discountText = '';
      if (hasDiscount) {
        discountText = `
          <div class="invoice-item-discount-line">
            Giá gốc: ${formatVND(originalUnitPrice)} · Giảm ${discountPercent}%
          </div>
        `;
      }

      let exclusionText = '';
      if (hasExclusions) {
        const names = excludedOpts.map(o => escapeHTML(o?.name || o?.id || '')).filter(Boolean);
        if (names.length > 0) {
          exclusionText = `
            <div class="invoice-item-exclusion-line">
              Không lấy: ${names.join(', ')}
            </div>
          `;
        }
      }

      return `
        <div class="invoice-item-row">
          <div class="invoice-item-main">
            <div class="invoice-item-title">
              <span class="invoice-item-index">${idx + 1}.</span>
              <span class="invoice-item-name">${name}</span>
            </div>
            <div class="invoice-item-price-calc">
              ${qty} × ${formatVND(unitPrice)}
            </div>
            <div class="invoice-item-total">
              ${formatVND(itemTotal)}
            </div>
          </div>
          ${discountText}
          ${exclusionText}
        </div>
      `;
    }).join('');
  }

  // Totals calculations with safe nullish coalescing fallbacks
  const subtotal = order.subtotalAmount ?? order.totalAmount ?? order.totalPrice ?? 0;
  const discountAmount = order.discountAmount ?? 0;
  const totalAmount = order.totalAmount ?? order.totalPrice ?? 0;

  return `
    <div class="invoice-card">
      <header class="invoice-header">
        <h1 class="invoice-shop-name">${shopName}</h1>
        ${shopAddress ? `<div class="invoice-shop-meta">${shopAddress}</div>` : ''}
        ${shopPhone ? `<div class="invoice-shop-meta">ĐT: ${shopPhone}</div>` : ''}
        <h2 class="invoice-title">HÓA ĐƠN BÁN HÀNG</h2>
        <div class="invoice-meta-row">
          <span>Mã đơn: <strong>${safeOrderId}</strong></span>
        </div>
        <div class="invoice-meta-row">
          <span>Ngày: ${dateStr} ${timeStr ? `· ${timeStr}` : ''}</span>
        </div>
      </header>

      <div class="invoice-divider"></div>

      <section class="invoice-customer-info">
        <div class="invoice-cust-row">
          <span class="invoice-label">Khách hàng:</span>
          <span class="invoice-val"><strong>${customerName}</strong></span>
        </div>
        ${customerPhone ? `
          <div class="invoice-cust-row">
            <span class="invoice-label">Điện thoại:</span>
            <span class="invoice-val">${customerPhone}</span>
          </div>
        ` : ''}
        ${customerAddress ? `
          <div class="invoice-cust-row">
            <span class="invoice-label">Địa chỉ:</span>
            <span class="invoice-val">${customerAddress}</span>
          </div>
        ` : ''}
      </section>

      <div class="invoice-divider"></div>

      <section class="invoice-items-list">
        ${itemsHtml}
      </section>

      <div class="invoice-divider"></div>

      <section class="invoice-totals">
        ${discountAmount > 0 ? `
          <div class="invoice-total-row">
            <span>Tạm tính:</span>
            <span>${formatVND(subtotal)}</span>
          </div>
          <div class="invoice-total-row invoice-discount-row">
            <span>Khuyến mãi:</span>
            <span>-${formatVND(discountAmount)}</span>
          </div>
        ` : ''}
        <div class="invoice-total-row invoice-grand-total">
          <span>TỔNG THANH TOÁN:</span>
          <span>${formatVND(totalAmount)}</span>
        </div>
      </section>

      ${customerNote ? `
        <div class="invoice-divider"></div>
        <section class="invoice-note">
          <div class="invoice-note-title">Ghi chú:</div>
          <div class="invoice-note-content">${customerNote}</div>
        </section>
      ` : ''}

      <footer class="invoice-footer">
        <p>Cảm ơn quý khách và hẹn gặp lại!</p>
      </footer>
    </div>
  `;
}
