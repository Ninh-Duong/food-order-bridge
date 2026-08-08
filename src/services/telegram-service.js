const { sendTelegramMessage } = require('../integrations/telegram-client');

function formatVND(amount) {
  if (typeof amount !== 'number') return '0đ';
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatDate(dateInput) {
  const dateObj = new Date(dateInput || Date.now());
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return {
    dateStr: `${day}/${month}/${year}`,
    timeStr: `${hours}:${minutes}`
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
  return `KHÁCH HÀNG\n${cust.name || 'N/A'} · ${cust.phone || 'N/A'}\n${cust.address || 'N/A'}`;
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
