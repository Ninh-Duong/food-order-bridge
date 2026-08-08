/**
 * Food Order Bridge - Optimistic UI Cart State Management with Stock & Customization Signature
 */
import { formatVND, showToast } from '../common/utils.js';

export function buildCustomizationSignature(productId, excludedOptionIds = []) {
  const normalized = Array.from(
    new Set((excludedOptionIds || []).map(id => String(id).trim().toUpperCase()))
  ).sort();
  if (normalized.length === 0) {
    return productId;
  }
  return `${productId}::${normalized.join(',')}`;
}

export function getItemSalePrice(item) {
  if (item.salePrice !== undefined) return item.salePrice;
  const price = Number(item.price) || 0;
  const discount = Number(item.discountPercent) || 0;
  return Math.round(price * (100 - discount) / 100);
}

class CartState {
  constructor() {
    this.items = new Map(); // key: lineId, value: { lineId, productId, item, quantity, excludedOptionIds }
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  addConfiguredItem(item, quantity = 1, excludedOptionIds = []) {
    if (!item || !item.id) return false;
    const productId = item.id;
    const normalizedExcluded = Array.from(
      new Set((excludedOptionIds || []).map(id => String(id).trim().toUpperCase()))
    ).sort();

    const lineId = buildCustomizationSignature(productId, normalizedExcluded);

    const maxStock = Number.isInteger(item.stockQuantity) ? item.stockQuantity : 0;
    const currentProductTotal = this.getProductTotalQuantity(productId);

    const currentLineQty = this.items.get(lineId)?.quantity || 0;
    const addedQty = quantity;
    const newProductTotal = currentProductTotal + addedQty;

    if (newProductTotal > maxStock) {
      if (maxStock <= 0) {
        showToast(`Món "${item.name}" hiện đã hết hàng.`, 'error');
      } else {
        showToast(`Món "${item.name}" chỉ còn tối đa ${maxStock} phần. (Giỏ hàng đã có ${currentProductTotal} phần)`, 'error');
      }
      return false;
    }

    const nextLineQty = currentLineQty + addedQty;
    if (nextLineQty <= 0) {
      this.items.delete(lineId);
    } else {
      this.items.set(lineId, {
        lineId,
        productId,
        item,
        quantity: nextLineQty,
        excludedOptionIds: normalizedExcluded
      });
    }

    this.notify();
    return true;
  }

  addItem(item, delta = 1) {
    const activeOpts = Array.isArray(item.customizationOptions) ? item.customizationOptions.filter(o => o.active !== false) : [];
    const defaultExcludedOptionIds = activeOpts.filter(o => o.defaultIncluded === false).map(o => o.id);
    return this.addConfiguredItem(item, delta, defaultExcludedOptionIds);
  }

  setLineQuantity(lineId, targetQuantity) {
    const entry = this.items.get(lineId);
    if (!entry) return false;

    const item = entry.item;
    const maxStock = Number.isInteger(item.stockQuantity) ? item.stockQuantity : 0;
    const otherLinesTotal = this.getProductTotalQuantity(entry.productId) - entry.quantity;

    if (targetQuantity + otherLinesTotal > maxStock) {
      const allowed = Math.max(0, maxStock - otherLinesTotal);
      showToast(`Món "${item.name}" chỉ còn tối đa ${maxStock} phần.`, 'error');
      if (allowed > 0) {
        entry.quantity = allowed;
      } else {
        this.items.delete(lineId);
      }
      this.notify();
      return false;
    }

    if (targetQuantity <= 0) {
      this.items.delete(lineId);
    } else {
      entry.quantity = targetQuantity;
    }

    this.notify();
    return true;
  }

  updateLineQuantity(lineId, delta) {
    const entry = this.items.get(lineId);
    if (!entry) return false;
    return this.setLineQuantity(lineId, entry.quantity + delta);
  }

  updateLineOptions(oldLineId, item, quantity, newExcludedOptionIds) {
    this.removeLine(oldLineId);
    return this.addConfiguredItem(item, quantity, newExcludedOptionIds);
  }

  removeLine(lineId) {
    this.items.delete(lineId);
    this.notify();
  }

  getLine(lineId) {
    return this.items.get(lineId) || null;
  }

  getProductTotalQuantity(productId) {
    let total = 0;
    for (const entry of this.items.values()) {
      if (entry.productId === productId) {
        total += entry.quantity;
      }
    }
    return total;
  }

  getItemQuantity(productId) {
    return this.getProductTotalQuantity(productId);
  }

  getRemainingStockQuantity(productId, menuItem) {
    const stock = menuItem ? (menuItem.stockQuantity ?? 0) : 0;
    const inCart = this.getProductTotalQuantity(productId);
    return Math.max(0, stock - inCart);
  }

  getTotalCount() {
    let count = 0;
    for (const entry of this.items.values()) {
      count += entry.quantity;
    }
    return count;
  }

  getSubtotalAmount() {
    let total = 0;
    for (const entry of this.items.values()) {
      const origPrice = Number(entry.item.price) || 0;
      total += (origPrice * entry.quantity);
    }
    return total;
  }

  getDiscountAmount() {
    let totalDiscount = 0;
    for (const entry of this.items.values()) {
      const origPrice = Number(entry.item.price) || 0;
      const salePrice = getItemSalePrice(entry.item);
      totalDiscount += ((origPrice - salePrice) * entry.quantity);
    }
    return totalDiscount;
  }

  getTotalAmount() {
    let total = 0;
    for (const entry of this.items.values()) {
      const salePrice = getItemSalePrice(entry.item);
      total += (salePrice * entry.quantity);
    }
    return total;
  }

  getPayloadItems() {
    const payload = [];
    for (const entry of this.items.values()) {
      payload.push({
        productId: entry.productId,
        quantity: entry.quantity,
        excludedOptionIds: entry.excludedOptionIds || []
      });
    }
    return payload;
  }

  reconcileWithMenu(latestMenuItems = []) {
    let modified = false;
    const menuMap = new Map(latestMenuItems.map(i => [i.id, i]));
    const productQuantities = new Map();

    for (const [lineId, entry] of Array.from(this.items.entries())) {
      const latestItem = menuMap.get(entry.productId);

      if (!latestItem || latestItem.active === false || (latestItem.stockQuantity ?? 0) <= 0) {
        this.items.delete(lineId);
        showToast(`Món "${entry.item.name}" đã hết hàng hoặc tạm ngưng bán và được xóa khỏi giỏ.`, 'info');
        modified = true;
      } else {
        const latestStock = latestItem.stockQuantity;
        const currentProdQty = productQuantities.get(entry.productId) || 0;
        if (currentProdQty + entry.quantity > latestStock) {
          const allowed = Math.max(0, latestStock - currentProdQty);
          if (allowed <= 0) {
            this.items.delete(lineId);
          } else {
            entry.quantity = allowed;
            productQuantities.set(entry.productId, currentProdQty + allowed);
          }
          showToast(`Số lượng món "${latestItem.name}" được điều chỉnh do giới hạn tồn kho.`, 'info');
          modified = true;
        } else {
          productQuantities.set(entry.productId, currentProdQty + entry.quantity);
        }
        entry.item = latestItem;
      }
    }

    if (modified) {
      this.notify();
    }
  }

  clear() {
    this.items.clear();
    this.notify();
  }
}

export const cart = new CartState();

// Update Floating Cart Bar DOM whenever cart state updates
cart.subscribe((cartState) => {
  const floatingBar = document.getElementById('floating-cart-bar');
  const countBadge = document.getElementById('cart-count-badge');
  const totalAmountEl = document.getElementById('cart-total-amount');

  const count = cartState.getTotalCount();
  const total = cartState.getTotalAmount();

  if (countBadge) countBadge.textContent = count;
  if (totalAmountEl) totalAmountEl.textContent = formatVND(total);

  if (floatingBar) {
    if (count > 0) {
      floatingBar.classList.add('active');
    } else {
      floatingBar.classList.remove('active');
    }
  }
});
