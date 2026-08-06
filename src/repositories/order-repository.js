class OrderRepository {
  constructor() {
    this.orders = new Map(); // orderId -> order
    this.requests = new Map(); // requestId -> orderId
  }

  findByRequestId(requestId) {
    const orderId = this.requests.get(requestId);
    if (orderId) {
      return this.orders.get(orderId) || null;
    }
    return null;
  }

  findById(orderId) {
    return this.orders.get(orderId) || null;
  }

  save(order) {
    this.orders.set(order.id, order);
    if (order.requestId) {
      this.requests.set(order.requestId, order.id);
    }
    return order;
  }

  update(orderId, fields) {
    const existing = this.orders.get(orderId);
    if (existing) {
      const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
      this.orders.set(orderId, updated);
      return updated;
    }
    return null;
  }

  getAll() {
    return Array.from(this.orders.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

module.exports = new OrderRepository();
