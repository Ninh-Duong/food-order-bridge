const { sendTelegramMessage } = require('../integrations/telegram-client');

function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatOrderMessage(order) {
  const dateObj = new Date(order.createdAt || Date.now());
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();

  const timeStr = `${hours}:${minutes} ${day}/${month}/${year}`;

  const itemsText = order.items.map(item => {
    return `${item.quantity} × ${item.name} — ${formatVND(item.itemTotal)}`;
  }).join('\n');

  return `🔔 ĐƠN HÀNG MỚI

Mã đơn: ${order.id}
Thời gian: ${timeStr}

Khách hàng: ${order.customer.name}
Điện thoại: ${order.customer.phone}
Địa chỉ: ${order.customer.address}

MÓN ĐÃ ĐẶT
${itemsText}

TỔNG CỘNG: ${formatVND(order.totalAmount)}

Ghi chú: ${order.customer.note || 'Không có'}`;
}

async function notifyNewOrder(order) {
  const messageText = formatOrderMessage(order);
  return await sendTelegramMessage(messageText);
}

module.exports = {
  formatOrderMessage,
  notifyNewOrder
};
