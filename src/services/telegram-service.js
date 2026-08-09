const { sendTelegramMessage } = require('../integrations/telegram-client');
const config = require('../config');

function formatVND(amount) {
  if (typeof amount !== 'number') return '0đ';
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatDate(dateInput) {
  const dateObj = new Date(dateInput || Date.now());
  if (isNaN(dateObj.getTime())) {
    return { dateStr: '--/--/----', timeStr: '--:--' };
  }
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: config.ORDER_TIMEZONE || 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(dateObj);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    dateStr: `${values.day}/${values.month}/${values.year}`,
    timeStr: `${values.hour}:${values.minute}`
  };
}

function formatItemBlock(item, index) {
  const safeName = String(item.name || '').toUpperCase();
  let block = `[${index}] ${item.quantity} × ${safeName}`;

  const excludedOpts = item.customization?.excludedOptions || [];
  if (excludedOpts.length > 0) {
    block += `\n    KHÔNG LẤY:`;
    for (const opt of excludedOpts) {
      block += `\n    - ${opt.name}`;
    }
  }

  return block;
}

function formatCustomerSection(order) {
  const cust = order.customer || {};
  const name = cust.name || order.customerName || 'N/A';
  const phone = cust.phone || order.phone || 'N/A';
  const fulfillmentType = order.fulfillmentType || 'DELIVERY';

  if (fulfillmentType === 'DINE_IN') {
    return `HÌNH THỨC: 🍽️ DÙNG TẠI QUÁN\nKHÁCH HÀNG\n${name} · ${phone}\nĐịa chỉ: Không yêu cầu`;
  } else {
    const address = cust.address || order.address || 'N/A';
    return `HÌNH THỨC: 🛵 GIAO TẬN NƠI\nKHÁCH HÀNG\n${name} · ${phone}\n${address}`;
  }
}

function formatPaymentSection(order) {
  const subtotal = order.subtotalAmount || order.totalAmount;
  const discount = order.discountAmount || 0;
  const total = order.totalAmount;

  const lines = [];
  if (discount > 0) {
    lines.push(`Tạm tính:               ${formatVND(subtotal)}`);
    lines.push(`Khuyến mãi:             -${formatVND(discount)}`);
  }
  lines.push(`TỔNG THANH TOÁN:        ${formatVND(total)}`);
  return lines.join('\n');
}

function formatKitchenTicket(order, options = {}) {
  const { dateStr, timeStr } = formatDate(order.createdAt);
  const orderId = order.id || 'N/A';

  const header = `================================\nPHIẾU BẾP · ĐƠN #${orderId}\n${dateStr} · ${timeStr}\n================================`;

  const items = (order.items || []).map((item, idx) => formatItemBlock(item, idx + 1));
  const itemsText = items.join('\n\n');

  const sections = [header, itemsText];

  if (order.customer && order.customer.note && order.customer.note.trim()) {
    sections.push(`--------------------------------\nGHI CHÚ CHUNG\n${order.customer.note.trim()}`);
  }

  sections.push(`--------------------------------\n${formatCustomerSection(order)}`);
  sections.push(`--------------------------------\n${formatPaymentSection(order)}\n================================`);

  return sections.join('\n\n');
}

function splitTelegramMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) {
    return [text];
  }

  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > maxLen) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function notifyNewOrder(order) {
  const ticketText = formatKitchenTicket(order);
  const chunks = splitTelegramMessage(ticketText);

  let lastResult = null;
  for (let i = 0; i < chunks.length; i++) {
    const chunkHeader = chunks.length > 1 ? `[ĐƠN #${order.id} · PHẦN ${i + 1}/${chunks.length}]\n` : '';
    lastResult = await sendTelegramMessage(chunkHeader + chunks[i]);
  }

  return lastResult || { messageId: null };
}

module.exports = {
  formatOrderMessage: formatKitchenTicket,
  formatKitchenTicket,
  formatCustomerSection,
  formatPaymentSection,
  splitTelegramMessage,
  notifyNewOrder
};
