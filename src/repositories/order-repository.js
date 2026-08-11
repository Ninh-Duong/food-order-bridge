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
      return this.formatMemoryOrder(this.orders.get(orderId)) || null;
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
    return this.formatMemoryOrder(this.orders.get(orderId)) || null;
  }

  async getPaginated({ page = 1, limit = 10 }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    if (isDBConnected()) {
      try {
        const [docs, totalOrders] = await Promise.all([
          OrderModel.find()
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
          OrderModel.countDocuments()
        ]);

        const orders = (docs || []).map(doc => this.formatDoc(doc));
        const totalPages = Math.max(1, Math.ceil(totalOrders / limitNum));

        return {
          orders,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalOrders,
            totalPages
          }
        };
      } catch (err) {
        console.error('Error getting paginated orders from MongoDB:', err.message);
        throw err;
      }
    }

    const list = Array.from(this.orders.values());
    list.sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tB !== tA) return tB - tA;
      const idA = String(a.id || '');
      const idB = String(b.id || '');
      return idB.localeCompare(idA);
    });

    const totalOrders = list.length;
    const totalPages = Math.max(1, Math.ceil(totalOrders / limitNum));
    const orders = list.slice(skip, skip + limitNum).map(o => this.formatMemoryOrder(o));

    return {
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalOrders,
        totalPages
      }
    };
  }

  async nextOrderId(dateKey, session = null) {
    const prefix = `FO-${dateKey}-`;

    if (isDBConnected()) {
      const queryOptions = session ? { session } : {};

      const latest = await OrderModel.findOne({
        id: { $regex: `^${prefix}\\d+$` }
      }, null, queryOptions).sort({ id: -1 }).select({ id: 1, _id: 0 }).lean();

      const latestSequence = latest
        ? Number.parseInt(latest.id.slice(prefix.length), 10) || 0
        : 0;

      try {
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
          { upsert: true, returnDocument: 'after', ...queryOptions }
        ).lean();

        if (counter && counter.seq) {
          return `${prefix}${String(counter.seq).padStart(4, '0')}`;
        }
      } catch (counterErr) {
        console.warn('⚠️ CounterModel pipeline findOneAndUpdate failed, falling back to $inc:', counterErr.message);
        const counter = await CounterModel.findOneAndUpdate(
          { _id: `order:${dateKey}` },
          { $inc: { seq: 1 } },
          { upsert: true, returnDocument: 'after', ...queryOptions }
        ).lean();
        const seqVal = Math.max(counter ? counter.seq : 1, latestSequence + 1);
        return `${prefix}${String(seqVal).padStart(4, '0')}`;
      }
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
          fulfillmentType: order.fulfillmentType || 'DELIVERY',
          customerName: order.customer ? order.customer.name : (order.customerName || ''),
          phone: order.customer ? order.customer.phone : (order.phone || ''),
          address: order.customer ? order.customer.address : (order.address || ''),
          note: order.customer ? order.customer.note : (order.note ?? ''),
          items: order.items,
          subtotalAmount: order.subtotalAmount ?? 0,
          discountAmount: order.discountAmount ?? 0,
          totalPrice: order.totalAmount ?? order.totalPrice ?? 0,
          telegramSent: order.notificationStatus === 'SENT',
          notificationStatus: order.notificationStatus ?? 'PENDING',
          telegramMessageId: order.telegramMessageId ?? null,
          notificationAttempts: order.notificationAttempts ?? 0,
          notificationError: order.notificationError ?? null,
          orderStatus: order.orderStatus ?? 'CONFIRMED',
          isPaid: order.isPaid === true,
          paymentMethod: order.paymentMethod ?? 'CASH',
          paymentProvider: order.paymentProvider ?? 'MANUAL',
          paymentStatus: order.paymentStatus ?? (order.isPaid === true ? 'PAID' : 'UNPAID'),
          paymentReference: order.paymentReference ?? null,
          paymentTransactionId: order.paymentTransactionId ?? null,
          paymentAmount: order.paymentAmount ?? order.totalAmount ?? 0,
          paymentExpiresAt: order.paymentExpiresAt ?? null,
          paymentQrImageUrl: order.paymentQrImageUrl ?? null,
          paymentLink: order.paymentLink ?? null,
          paymentMock: order.paymentMock === true,
          cancelReason: order.cancelReason ?? null,
          cancelledAt: order.cancelledAt ?? null,
          cancelledBy: order.cancelledBy ?? null,
          retryOfOrderId: order.retryOfOrderId ?? null,
          unpaidSlotReleased: order.unpaidSlotReleased === true,
          orderActionTokenHash: order.orderActionTokenHash ?? null,
          paidAt: order.paidAt ?? null,
          paidBy: order.paidBy ?? null,
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

    const { actionToken, ...persistableOrder } = order;
    const orderToSave = {
      ...persistableOrder,
      fulfillmentType: order.fulfillmentType || 'DELIVERY',
      subtotalAmount: order.subtotalAmount ?? 0,
      discountAmount: order.discountAmount ?? 0,
      totalAmount: order.totalAmount ?? order.totalPrice ?? 0,
      isPaid: order.isPaid === true,
      paymentMethod: order.paymentMethod ?? 'CASH',
      paymentProvider: order.paymentProvider ?? 'MANUAL',
      paymentStatus: order.paymentStatus ?? (order.isPaid === true ? 'PAID' : 'UNPAID'),
      paymentReference: order.paymentReference ?? null,
      paymentTransactionId: order.paymentTransactionId ?? null,
      paymentAmount: order.paymentAmount ?? order.totalAmount ?? 0,
      paymentExpiresAt: order.paymentExpiresAt ?? null,
      paymentQrImageUrl: order.paymentQrImageUrl ?? null,
      paymentLink: order.paymentLink ?? null,
      paymentMock: order.paymentMock === true,
      orderStatus: order.orderStatus ?? 'CONFIRMED',
      cancelReason: order.cancelReason ?? null,
      cancelledAt: order.cancelledAt ?? null,
      cancelledBy: order.cancelledBy ?? null,
      retryOfOrderId: order.retryOfOrderId ?? null,
      unpaidSlotReleased: order.unpaidSlotReleased === true,
      orderActionTokenHash: order.orderActionTokenHash ?? null,
      paidAt: order.paidAt ?? null,
      paidBy: order.paidBy ?? null
    };

    this.orders.set(order.id, orderToSave);
    if (order.requestId) {
      this.requests.set(order.requestId, order.id);
    }
    this.saveAllToFile();
    return orderToSave;
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

  async updatePaymentStatus(orderId, paymentData) {
    let updatedOrder = null;
    if (isDBConnected()) {
      try {
        const doc = await OrderModel.findOneAndUpdate(
          { id: orderId },
          { $set: paymentData },
          { returnDocument: 'after', new: true }
        ).lean();
        if (!doc) return null;
        updatedOrder = this.formatDoc(doc);
      } catch (err) {
        console.error('Error updating payment status in MongoDB:', err.message);
        throw err;
      }
    }

    const existing = this.orders.get(orderId);
    if (!updatedOrder && !existing) return null;

    const memoryUpdated = {
      ...(existing || updatedOrder),
      ...paymentData,
      updatedAt: new Date().toISOString()
    };
    this.orders.set(orderId, memoryUpdated);
    this.saveAllToFile();

    return updatedOrder || memoryUpdated;
  }

  async getPaidOrdersByRange({ from, to }) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isDBConnected()) {
      try {
        const docs = await OrderModel.find({
          isPaid: true,
          paidAt: { $gte: fromDate, $lt: toDate }
        }).sort({ paidAt: 1 }).lean();
        return (docs || []).map(d => this.formatDoc(d));
      } catch (err) {
        console.error('Error getting paid orders by range from MongoDB:', err.message);
        throw err;
      }
    }

    const paidOrders = [];
    for (const order of this.orders.values()) {
      if (order.isPaid === true && order.paidAt) {
        const pDate = new Date(order.paidAt);
        if (pDate >= fromDate && pDate < toDate) {
          paidOrders.push(order);
        }
      }
    }
    return paidOrders.sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
  }

  async getOrdersByCreatedRange({ from, to }) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isDBConnected()) {
      try {
        const docs = await OrderModel.find({
          createdAt: { $gte: fromDate, $lt: toDate }
        }).sort({ createdAt: 1 }).lean();
        return (docs || []).map(d => this.formatDoc(d));
      } catch (err) {
        console.error('Error getting orders by created range from MongoDB:', err.message);
        throw err;
      }
    }

    return Array.from(this.orders.values())
      .filter(order => {
        const created = new Date(order.createdAt || 0);
        return created >= fromDate && created < toDate;
      })
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(order => this.formatMemoryOrder(order));
  }

  async getCancelledOrdersByRange({ from, to }) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isDBConnected()) {
      try {
        const docs = await OrderModel.find({
          orderStatus: 'CANCELLED',
          cancelledAt: { $gte: fromDate, $lt: toDate }
        }).sort({ cancelledAt: 1 }).lean();
        return (docs || []).map(d => this.formatDoc(d));
      } catch (err) {
        console.error('Error getting cancelled orders by range from MongoDB:', err.message);
        throw err;
      }
    }

    return Array.from(this.orders.values())
      .filter(order => {
        const cancelled = new Date(order.cancelledAt || 0);
        return order.orderStatus === 'CANCELLED' && cancelled >= fromDate && cancelled < toDate;
      })
      .sort((a, b) => new Date(a.cancelledAt) - new Date(b.cancelledAt))
      .map(order => this.formatMemoryOrder(order));
  }

  async getPendingPaymentOrders({ scope = 'DINE_IN', before = null } = {}) {
    const query = {
      isPaid: false,
      orderStatus: { $ne: 'CANCELLED' },
      paymentStatus: { $in: ['UNPAID', 'PENDING'] }
    };
    if (scope === 'DINE_IN') query.fulfillmentType = 'DINE_IN';
    if (before) query.createdAt = { $lte: new Date(before) };

    if (isDBConnected()) {
      try {
        const docs = await OrderModel.find(query).sort({ createdAt: 1 }).lean();
        return (docs || []).map(d => this.formatDoc(d));
      } catch (err) {
        console.error('Error getting pending payment orders from MongoDB:', err.message);
        throw err;
      }
    }

    return Array.from(this.orders.values())
      .filter(order => {
        const isPending = order.isPaid !== true && order.orderStatus !== 'CANCELLED'
          && ['UNPAID', 'PENDING'].includes(order.paymentStatus || (order.isPaid ? 'PAID' : 'UNPAID'));
        const inScope = scope !== 'DINE_IN' || (order.fulfillmentType || 'DELIVERY') === 'DINE_IN';
        const beforeMatch = !before || new Date(order.createdAt || 0) <= new Date(before);
        return isPending && inScope && beforeMatch;
      })
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(order => this.formatMemoryOrder(order));
  }

  async countPendingPayments(scope = 'DINE_IN') {
    if (isDBConnected()) {
      const query = {
        isPaid: false,
        orderStatus: { $ne: 'CANCELLED' },
        paymentStatus: { $in: ['UNPAID', 'PENDING'] }
      };
      if (scope === 'DINE_IN') query.fulfillmentType = 'DINE_IN';
      return await OrderModel.countDocuments(query);
    }
    const pending = await this.getPendingPaymentOrders({ scope });
    return pending.length;
  }

  async transitionPendingOrder(orderId, fields) {
    if (isDBConnected()) {
      try {
        const doc = await OrderModel.findOneAndUpdate(
          {
            id: orderId,
            isPaid: false,
            orderStatus: { $ne: 'CANCELLED' },
            paymentStatus: { $in: ['UNPAID', 'PENDING'] }
          },
          { $set: fields },
          { returnDocument: 'after', new: true }
        ).lean();
        return doc ? this.formatDoc(doc) : null;
      } catch (err) {
        console.error('Error transitioning pending order in MongoDB:', err.message);
        throw err;
      }
    }

    const existing = this.orders.get(orderId);
    if (!existing || existing.isPaid === true || existing.orderStatus === 'CANCELLED'
      || !['UNPAID', 'PENDING'].includes(existing.paymentStatus || 'UNPAID')) {
      return null;
    }
    const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
    this.orders.set(orderId, updated);
    this.saveAllToFile();
    return this.formatMemoryOrder(updated);
  }

  formatDoc(doc) {
    if (!doc) return null;
    const normalizedAddress = doc.address ?? (doc.customer ? doc.customer.address : '') ?? '';
    const fulfillmentType = doc.fulfillmentType || 'DELIVERY';
    return {
      id: doc.id,
      requestId: doc.requestId,
      fulfillmentType,
      customer: {
        name: doc.customerName ?? (doc.customer ? doc.customer.name : '') ?? '',
        phone: doc.phone ?? (doc.customer ? doc.customer.phone : '') ?? '',
        address: normalizedAddress,
        note: doc.note ?? (doc.customer ? doc.customer.note : '') ?? ''
      },
      items: doc.items || [],
      subtotalAmount: doc.subtotalAmount ?? 0,
      discountAmount: doc.discountAmount ?? 0,
      totalAmount: doc.totalPrice ?? doc.totalAmount ?? 0,
      orderStatus: doc.orderStatus || 'CONFIRMED',
      notificationStatus: doc.notificationStatus ?? (doc.telegramSent ? 'SENT' : 'PENDING'),
      telegramMessageId: doc.telegramMessageId ?? null,
      notificationAttempts: doc.notificationAttempts ?? 0,
      notificationError: doc.notificationError ?? null,
      isPaid: doc.isPaid === true,
      paymentMethod: doc.paymentMethod ?? 'CASH',
      paymentProvider: doc.paymentProvider ?? 'MANUAL',
      paymentStatus: doc.paymentStatus ?? (doc.isPaid === true ? 'PAID' : 'UNPAID'),
      paymentReference: doc.paymentReference ?? null,
      paymentTransactionId: doc.paymentTransactionId ?? null,
      paymentAmount: doc.paymentAmount ?? doc.totalPrice ?? 0,
      paymentExpiresAt: doc.paymentExpiresAt ?? null,
      paymentQrImageUrl: doc.paymentQrImageUrl ?? null,
      paymentLink: doc.paymentLink ?? null,
      paymentMock: doc.paymentMock === true,
      cancelReason: doc.cancelReason ?? null,
      cancelledAt: doc.cancelledAt ?? null,
      cancelledBy: doc.cancelledBy ?? null,
      retryOfOrderId: doc.retryOfOrderId ?? null,
      unpaidSlotReleased: doc.unpaidSlotReleased === true,
      orderActionTokenHash: doc.orderActionTokenHash ?? null,
      paidAt: doc.paidAt ?? null,
      paidBy: doc.paidBy ?? null,
      createdAt: doc.createdAt ?? null
    };
  }

  formatMemoryOrder(order) {
    if (!order) return null;
    const cust = order.customer || {};
    const normalizedAddress = cust.address ?? order.address ?? '';
    return {
      ...order,
      fulfillmentType: order.fulfillmentType || 'DELIVERY',
      customer: {
        name: cust.name ?? order.customerName ?? '',
        phone: cust.phone ?? order.phone ?? '',
        address: normalizedAddress,
        note: cust.note ?? order.note ?? ''
      }
    };
  }

  async clearAll() {
    if (isDBConnected()) {
      try {
        await OrderModel.deleteMany({});
        await CounterModel.deleteMany({});
      } catch (err) {
        console.error('Error clearing orders in MongoDB:', err.message);
        throw err;
      }
    }
    this.orders.clear();
    this.requests.clear();
    this.saveAllToFile();
    return true;
  }
}

module.exports = new OrderRepository();
