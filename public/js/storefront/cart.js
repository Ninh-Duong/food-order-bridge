/**
 * Food Order Bridge - Optimistic UI Cart State Management
 */
import { formatVND } from '../common/utils.js';

class CartState {
  constructor() {
    this.items = new Map(); // key: productId, value: { item, quantity }
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  addItem(item, delta = 1) {
    const current = this.items.get(item.id);
    if (current) {
      current.quantity += delta;
      if (current.quantity <= 0) {
        this.items.delete(item.id);
      }
    } else if (delta > 0) {
      this.items.set(item.id, { item, quantity: delta });
    }
    // Optimistic UI Update trigger
    this.notify();
  }

  removeItem(productId) {
    this.items.delete(productId);
    this.notify();
  }

  getItemQuantity(productId) {
    return this.items.get(productId)?.quantity || 0;
  }

  getTotalCount() {
    let count = 0;
    for (const entry of this.items.values()) {
      count += entry.quantity;
    }
    return count;
  }

  getTotalAmount() {
    let total = 0;
    for (const entry of this.items.values()) {
      total += (entry.item.price * entry.quantity);
    }
    return total;
  }

  getPayloadItems() {
    const payload = [];
    for (const [productId, entry] of this.items.entries()) {
      payload.push({
        productId,
        quantity: entry.quantity
      });
    }
    return payload;
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
