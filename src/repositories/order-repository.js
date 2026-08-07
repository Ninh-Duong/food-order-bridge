const { isDBConnected } = require('../db');
const { OrderModel } = require('../models');

class OrderRepository {
  constructor() {
    this.orders = new Map(); // orderId -> order
    this.requests = new Map(); // requestId -> orderId
  }

  async findByRequestId(requestId) {
    if (isDBConnected()) {
      try {
        const doc = await OrderModel.findOne({ requestId }).lean();
        if (doc) return this.formatDoc(doc);
      } catch (err) {
        console.error('Error finding order by requestId in MongoDB:', err.message);
      }
    }
    const orderId = this.requests.get(requestId);
    if (orderId) {
      return this.orders.get(orderId) || null;
    }
    return null;
  }

  async findById(orderId) {
    if (isDBConnected()) {
      try {
        const doc = await OrderModel.findOne({ id: orderId }).lean();
        if (doc) return this.formatDoc(doc);
      } catch (err) {
        console.error('Error finding order by id in MongoDB:', err.message);
      }
    }
    return this.orders.get(orderId) || null;
  }

  async save(order) {
    if (isDBConnected()) {
      try {
        const docData = {
          id: order.id,
          requestId: order.requestId,
          customerName: order.customer ? order.customer.name : order.customerName,
          phone: order.customer ? order.customer.phone : order.phone,
          address: order.customer ? order.customer.address : order.address,
          note: order.customer ? order.customer.note : order.note || '',
          items: order.items,
          totalPrice: order.totalAmount || order.totalPrice,
          telegramSent: order.notificationStatus === 'SENT',
          createdAt: order.createdAt || new Date(),
          updatedAt: new Date()
        };
        await OrderModel.create(docData);
      } catch (err) {
        console.error('Error saving order to MongoDB:', err.message);
      }
    }
    this.orders.set(order.id, order);
    if (order.requestId) {
      this.requests.set(order.requestId, order.id);
    }
    return order;
  }

  async update(orderId, fields) {
    if (isDBConnected()) {
      try {
        await OrderModel.findOneAndUpdate({ id: orderId }, { $set: fields });
      } catch (err) {
        console.error('Error updating order in MongoDB:', err.message);
      }
    }
    const existing = this.orders.get(orderId);
    if (existing) {
      const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
      this.orders.set(orderId, updated);
      return updated;
    }
    return null;
  }

  async getAll() {
    if (isDBConnected()) {
      try {
        const docs = await OrderModel.find().sort({ createdAt: -1 }).lean();
        if (docs && docs.length > 0) {
          return docs.map(d => this.formatDoc(d));
        }
      } catch (err) {
        console.error('Error fetching all orders from MongoDB:', err.message);
      }
    }
    return Array.from(this.orders.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  formatDoc(doc) {
    return {
      id: doc.id,
      requestId: doc.requestId,
      customer: {
        name: doc.customerName,
        phone: doc.phone,
        address: doc.address,
        note: doc.note
      },
      items: doc.items,
      totalAmount: doc.totalPrice,
      orderStatus: 'CONFIRMED',
      notificationStatus: doc.telegramSent ? 'SENT' : 'PENDING',
      createdAt: doc.createdAt
    };
  }
}

module.exports = new OrderRepository();
