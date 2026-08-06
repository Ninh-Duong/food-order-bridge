/**
 * Food Order Bridge - Helper Utilities
 */

/**
 * Format raw integer amount into Vietnamese Dong currency string
 * e.g., 50000 -> 50.000đ
 */
export function formatVND(amount) {
  if (typeof amount !== 'number') return '0đ';
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

/**
 * Show temporary toast notification
 */
export function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Dynamic alt text generator for a11y
 */
export function buildAltText(itemName, category) {
  return `${itemName} - Món ngon ${category || 'tại cửa hàng'}`;
}
