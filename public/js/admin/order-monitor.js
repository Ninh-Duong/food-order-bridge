/**
 * Food Order Bridge - Admin Order Monitor & Status Viewer
 */
import { API } from '../common/api.js';
import { formatVND, showToast } from '../common/utils.js';

export async function initOrderMonitor() {
  await fetchOrders();

  const refreshBtn = document.getElementById('btn-refresh-orders');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchOrders);
  }
}

async function fetchOrders() {
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  try {
    const data = await API.get('/api/orders');
    const orders = data.orders || [];
    renderOrdersTable(orders);
  } catch (error) {
    showToast('Lỗi tải danh sách đơn hàng', 'error');
  }
}

function renderOrdersTable(orders) {
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  if (orders.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">Chưa có đơn hàng nào được ghi nhận.</td></tr>`;
    return;
  }

  tableBody.innerHTML = orders.map(order => `
    <tr>
      <td><strong style="color: var(--color-primary);">${order.id}</strong></td>
      <td>
        <strong>${order.customer?.name || 'Khách lẻ'}</strong>
        <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${order.customer?.phone || ''}</div>
      </td>
      <td style="font-size: var(--font-size-xs); max-width: 200px;" class="line-clamp-2">${order.customer?.address || ''}</td>
      <td>
        <ul style="font-size: var(--font-size-xs); padding-left: 12px;">
          ${(order.items || []).map(i => `<li>${i.quantity}x ${i.name || i.productId}</li>`).join('')}
        </ul>
      </td>
      <td style="font-weight: 700; color: var(--color-primary);">${formatVND(order.totalAmount)}</td>
      <td>
        <span class="badge ${order.notificationStatus === 'SENT' ? 'badge-active' : 'badge-inactive'}">
          ${order.notificationStatus === 'SENT' ? '🟢 Telegram OK' : '🔴 Lỗi Telegram'}
        </span>
      </td>
      <td style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${new Date(order.createdAt).toLocaleTimeString('vi-VN')}</td>
    </tr>
  `).join('');
}
