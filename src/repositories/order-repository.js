const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const { OrderModel, CounterModel } = require('../models');

const ORDERS_FILE = path.join(__dirname, '..', 'data', 'orders.json');

class OrderRepository {
  constructor() {
    this.orders = new Map(); // orderId -> order
    this.requests = new Map(); // requestId -> orderId
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(ORDERS_FILE)) {
        const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
        if (raw && raw.trim()) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            list.forEach(order => {
              if (order && order.id) {
                this.orders.set(order.id, order);
                if (order.requestId) {
                  this.requests.set(order.requestId, order.id);
                }
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('Error loading orders.json:', err.message);
    }
  }

  saveAllToFile() {
    try {
      fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
      const tempFile = `${ORDERS_FILE}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const list = Array.from(this.orders.values());
      fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf8');
      try {
        fs.renameSync(tempFile, ORDERS_FILE);
      } catch (e) {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(list, null, 2), 'utf8');
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    } catch (err) {
      console.error('Error saving orders to file:', err.message);
    }
  }

  async findByRequestId(requestId) {
    if (!requestId) return null;
    if (isDBConnected()) {
      try {
        const doc = await OrderModel.findOne({ requestId }).lean();
        if (doc) return this.formatDoc(doc);
      } catch (err) {
        console.error('Error finding order by requestId in MongoDB:', err.message);
        throw err;
      }
    }
    const orderId = this.requests.get(requestId);
    if (orderId) {
      return this.orders.get(orderId) || null;
    }
    return null;
  }

  async findById(orderId) {
    if (!orderId) return null;
    if (isDBConnected()) {
      try {
        const doc = await OrderModel.findOne({ id: orderId }).lean();
        if (doc) return this.formatDoc(doc);
      } catch (err) {
        console.error('Error finding order by id in MongoDB:', err.message);
        throw err;
      }
    }
    return this.orders.get(orderId) || null;
  }

  async nextOrderId(dateKey) {
    const prefix = `FO-${dateKey}-`;

    if (isDBConnected()) {
      const latest = await OrderModel.findOne({
        id: { $regex: `^${prefix}\\d+$` }
      }).sort({ id: -1 }).select({ id: 1, _id: 0 }).lean();

      const latestSequence = latest
        ? Number.parseInt(latest.id.slice(prefix.length), 10) || 0
        : 0;

      const counter = await CounterModel.findOneAndUpdate(
        { _id: `order:${dateKey}` },
        [{
          $set: {
            seq: {
              $add: [
                { $max: [{ $ifNull: ['$seq', 0] }, latestSequence] },
                1
              ]
            }
          }
        }],
        { upsert: true, returnDocument: 'after' }
      ).lean();

      return `${prefix}${String(counter.seq).padStart(4, '0')}`;
    }

    let latestSequence = 0;
    for (const id of this.orders.keys()) {
      if (!id.startsWith(prefix)) continue;
      const value = Number.parseInt(id.slice(prefix.length), 10);
      if (Number.isInteger(value) && value > latestSequence) latestSequence = value;
    }
    return `${prefix}${String(latestSequence + 1).padStart(4, '0')}`;
  }

  async save(order, session) {
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
          subtotalAmount: order.subtotalAmount || 0,
          discountAmount: order.discountAmount || 0,
          totalPrice: order.totalAmount || order.totalPrice,
          telegramSent: order.notificationStatus === 'SENT',
          notificationStatus: order.notificationStatus || 'PENDING',
          telegramMessageId: order.telegramMessageId || null,
          notificationAttempts: order.notificationAttempts || 0,
          notificationError: order.notificationError || null,
          createdAt: order.createdAt || new Date(),
          updatedAt: new Date()
        };
        const options = session ? { session } : {};
        await OrderModel.create([docData], options);
      } catch (err) {
        console.error('Error saving order to MongoDB:', err.message);
        throw err;
      }
    }

    this.orders.set(order.id, order);
    if (order.requestId) {
      this.requests.set(order.requestId, order.id);
    }
    this.saveAllToFile();
    return order;
  }

  async update(orderId, fields) {
    if (isDBConnected()) {
      try {
        const mongoFields = { ...fields };
        if (fields.notificationStatus === 'SENT') {
          mongoFields.telegramSent = true;
        } else if (fields.notificationStatus === 'FAILED') {
          mongoFields.telegramSent = false;
        }
        await OrderModel.findOneAndUpdate({ id: orderId }, { $set: mongoFields });
      } catch (err) {
        console.error('Error updating order in MongoDB:', err.message);
        throw err;
      }
    }
    const existing = this.orders.get(orderId);
    if (existing) {
      const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
      this.orders.set(orderId, updated);
      this.saveAllToFile();
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
        throw err;
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
      subtotalAmount: doc.subtotalAmount || 0,
      discountAmount: doc.discountAmount || 0,
      totalAmount: doc.totalPrice,
      orderStatus: 'CONFIRMED',
      notificationStatus: doc.notificationStatus || (doc.telegramSent ? 'SENT' : 'PENDING'),
      telegramMessageId: doc.telegramMessageId || null,
      notificationAttempts: doc.notificationAttempts || 0,
      notificationError: doc.notificationError || null,
      createdAt: doc.createdAt
    };
  }
}

module.exports = new OrderRepository();
