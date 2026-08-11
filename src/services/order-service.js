const { z } = require('zod');
const mongoose = require('mongoose');
const crypto = require('crypto');
const orderRepository = require('../repositories/order-repository');
const menuRepository = require('../repositories/menu-repository');
const menuService = require('./menu-service');
const telegramService = require('./telegram-service');
const paymentService = require('./payment-service');
const { calculateSalePrice } = require('../utils/price-calculator');
const { isDBConnected } = require('../db');
const config = require('../config');

const OrderSchema = z.object({
  requestId: z.string().min(1, 'requestId là bắt buộc'),
  fulfillmentType: z.enum(['DELIVERY', 'DINE_IN']).default('DELIVERY'),
  paymentMethod: z.enum(['CASH', 'BANK_QR', 'MOMO_QR']).optional().default('CASH'),
  customer: z.object({
    name: z.string().optional().default(''),
    phone: z.string().optional().default('')
      .transform(val => (typeof val === 'string' ? val.replace(/[\s.-]/g, '') : val)),
    address: z.string().optional().default(''),
    note: z.string().optional().default('')
  }),
  items: z.array(
    z.object({
      productId: z.string().min(1, 'Mã sản phẩm không hợp lệ'),
      quantity: z.number().int('Số lượng phải là số nguyên').positive('Số lượng phải lớn hơn 0').max(999, 'Số lượng không vượt quá 999'),
      excludedOptionIds: z.array(z.string()).max(20, 'Tối đa 20 tùy chọn thành phần').optional().default([])
    })
  ).min(1, 'Đơn hàng phải chứa ít nhất 1 món')
}).superRefine((data, ctx) => {
  if (data.fulfillmentType === 'DELIVERY' && data.paymentMethod !== 'CASH') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Thanh toán QR hiện chỉ áp dụng cho đơn dùng tại quán',
      path: ['paymentMethod']
    });
  }

  if (data.fulfillmentType === 'DELIVERY') {
    if (!data.customer.name.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tên khách hàng là bắt buộc',
        path: ['customer', 'name']
      });
    }
    if (!/^0\d{9}$/.test(data.customer.phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0',
        path: ['customer', 'phone']
      });
    }
    const trimmedAddress = (data.customer.address || '').trim();
    if (trimmedAddress.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Vui lòng nhập địa chỉ giao hàng cụ thể',
        path: ['customer', 'address']
      });
    } else {
      data.customer.address = trimmedAddress;
    }
  } else if (data.fulfillmentType === 'DINE_IN') {
    if (data.customer.phone && !/^0\d{9}$/.test(data.customer.phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0',
        path: ['customer', 'phone']
      });
    }
    data.customer.address = '';
  }
});

async function generateOrderId(session = null) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.ORDER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return orderRepository.nextOrderId(`${values.year}${values.month}${values.day}`, session);
}

// Simple Mutex queue for JSON fallback critical section
let orderLockChain = Promise.resolve();

function runWithLock(fn) {
  const nextLock = orderLockChain.then(fn, fn);
  orderLockChain = nextLock.catch(() => {});
  return nextLock;
}

function hashOrderActionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

class OrderService {
  async processOrder(rawPayload) {
    // 1. Validate payload schema
    const parseResult = OrderSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map(e => e.message).join(', ');
      throw { status: 422, message: `Dữ liệu không hợp lệ: ${errorMsg}` };
    }

    const { requestId, fulfillmentType, paymentMethod, customer, items: rawItems } = parseResult.data;

    // 2. Aggregate duplicate (productId + sorted excludedOptionIds) in payload
    const configMap = new Map();
    for (const itemReq of rawItems) {
      const pid = itemReq.productId.trim().toUpperCase();
      const normExcluded = Array.from(
        new Set((itemReq.excludedOptionIds || []).map(id => String(id).trim().toUpperCase()))
      ).sort();
      const sig = `${pid}::${normExcluded.join(',')}`;

      if (configMap.has(sig)) {
        configMap.get(sig).quantity += itemReq.quantity;
      } else {
        configMap.set(sig, {
          productId: pid,
          quantity: itemReq.quantity,
          excludedOptionIds: normExcluded
        });
      }
    }
    const aggregatedItems = Array.from(configMap.values());

    // 3. Quick Idempotency check before acquiring lock or transaction
    const existingOrder = await orderRepository.findByRequestId(requestId);
    if (existingOrder) {
      console.log(`[Idempotency] Duplicate request found for requestId ${requestId}. Returning cached order ${existingOrder.id}`);
      return {
        statusCode: 200,
        result: {
          orderId: existingOrder.id,
          status: existingOrder.orderStatus,
          notificationStatus: existingOrder.notificationStatus,
          fulfillmentType: existingOrder.fulfillmentType || 'DELIVERY',
          createdAt: existingOrder.createdAt,
          total: existingOrder.totalAmount,
          actionToken: existingOrder.requestId || null,
          payment: this.serializePayment(existingOrder)
        }
      };
    }

    const createOrder = async () => {
      await this._expireUnpaidOrders();
      await this.assertPaymentCapacity(fulfillmentType);
      if (isDBConnected()) {
        return await this.processOrderMongoDB(requestId, customer, aggregatedItems, true, fulfillmentType, paymentMethod);
      }
      return await this.processOrderJSON(requestId, customer, aggregatedItems, fulfillmentType, paymentMethod);
    };

    // Serialize DINE_IN creation so the global three-order capacity cannot be
    // exceeded by concurrent requests in the same application instance.
    if (fulfillmentType === 'DINE_IN' || config.getPaymentPendingScope() === 'ALL') {
      return await runWithLock(createOrder);
    }

    if (isDBConnected()) {
      return await this.processOrderMongoDB(requestId, customer, aggregatedItems, true, fulfillmentType, paymentMethod);
    }
    return await runWithLock(() => this.processOrderJSON(requestId, customer, aggregatedItems, fulfillmentType, paymentMethod));
  }

  async processOrderMongoDB(requestId, customer, aggregatedItems, allowTransaction = true, fulfillmentType = 'DELIVERY', paymentMethod = 'CASH') {
    const existingOrder = await orderRepository.findByRequestId(requestId);
    if (existingOrder) {
      return {
        statusCode: 200,
        result: {
          orderId: existingOrder.id,
          status: existingOrder.orderStatus,
          notificationStatus: existingOrder.notificationStatus,
          fulfillmentType: existingOrder.fulfillmentType || 'DELIVERY',
          createdAt: existingOrder.createdAt,
          total: existingOrder.totalAmount,
          actionToken: existingOrder.requestId || null,
          payment: this.serializePayment(existingOrder)
        }
      };
    }

    let session = null;
    if (allowTransaction) {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
      } catch (sessionErr) {
        session = null;
      }
    }

    try {
      // Calculate total required quantity per productId
      const totalProductQuantityMap = new Map();
      for (const itemReq of aggregatedItems) {
        const curr = totalProductQuantityMap.get(itemReq.productId) || 0;
        totalProductQuantityMap.set(itemReq.productId, curr + itemReq.quantity);
      }

      // Check stock & item validity for each product
      const insufficientItems = [];
      const productMenuMap = new Map();

      for (const [productId, totalReqQty] of totalProductQuantityMap.entries()) {
        const menuItem = await menuRepository.getById(productId);
        if (!menuItem) {
          throw { status: 422, message: `Món ăn với mã ${productId} không tồn tại` };
        }
        if (menuItem.active === false) {
          throw { status: 422, message: `Món "${menuItem.name}" hiện đang tạm ngưng bán hôm nay` };
        }

        if (menuItem.stockQuantity < totalReqQty) {
          insufficientItems.push({
            productId: menuItem.id,
            name: menuItem.name,
            requestedQuantity: totalReqQty,
            availableQuantity: Math.max(0, menuItem.stockQuantity)
          });
        }
        productMenuMap.set(productId, menuItem);
      }

      if (insufficientItems.length > 0) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        const first = insufficientItems[0];
        throw {
          status: 409,
          code: 'INSUFFICIENT_STOCK',
          message: `Món "${first.name}" chỉ còn ${first.availableQuantity} phần.`,
          items: insufficientItems
        };
      }

      // Process items & build server customization snapshot
      const processedItems = [];
      let subtotalAmount = 0;
      let totalAmount = 0;

      for (const itemReq of aggregatedItems) {
        const menuItem = productMenuMap.get(itemReq.productId);
        const originalUnitPrice = menuItem.price;
        const discountPercent = menuItem.discountPercent || 0;
        const unitPrice = calculateSalePrice(originalUnitPrice, discountPercent);
        const itemSubtotalBeforeDiscount = originalUnitPrice * itemReq.quantity;
        const itemTotal = unitPrice * itemReq.quantity;
        const discountAmount = itemSubtotalBeforeDiscount - itemTotal;

        subtotalAmount += itemSubtotalBeforeDiscount;
        totalAmount += itemTotal;

        // Server-side options validation & snapshot creation
        const activeOptions = Array.isArray(menuItem.customizationOptions)
          ? menuItem.customizationOptions.filter(o => o.active !== false)
          : [];
        const activeOptMap = new Map(activeOptions.map(o => [o.id, o.name]));

        const excludedOptionsSnapshot = [];
        for (const exId of itemReq.excludedOptionIds) {
          const optName = activeOptMap.get(exId);
          if (!optName) {
            throw { status: 422, message: `Tùy chọn thành phần "${exId}" không hợp lệ hoặc không áp dụng cho món "${menuItem.name}"` };
          }
          excludedOptionsSnapshot.push({ id: exId, name: optName });
        }

        const excludedSet = new Set(itemReq.excludedOptionIds);
        const includedOptionsSnapshot = activeOptions
          .filter(o => !excludedSet.has(o.id))
          .map(o => ({ id: o.id, name: o.name }));

        processedItems.push({
          productId: menuItem.id,
          name: menuItem.name,
          originalUnitPrice,
          discountPercent,
          unitPrice,
          quantity: itemReq.quantity,
          discountAmount,
          itemSubtotalBeforeDiscount,
          itemTotal,
          customization: {
            excludedOptions: excludedOptionsSnapshot,
            includedOptions: includedOptionsSnapshot
          }
        });
      }

      // Decrement stock for total quantity per product
      const decrementedProducts = [];
      for (const [productId, totalReqQty] of totalProductQuantityMap.entries()) {
        const menuItem = productMenuMap.get(productId);
        if (session) {
          const updatedDoc = await menuRepository.decrementStockInTransaction(productId, totalReqQty, session);
          if (!updatedDoc) {
            throw {
              status: 409,
              code: 'INSUFFICIENT_STOCK',
              message: `Xung đột kho cho món "${menuItem.name}". Vui lòng thử lại.`,
              items: [{ productId: menuItem.id, name: menuItem.name, requestedQuantity: totalReqQty, availableQuantity: menuItem.stockQuantity }]
            };
          }
        } else {
          const updatedDoc = await menuRepository.decrementStockAtomic(productId, totalReqQty);
          if (!updatedDoc) {
            for (const dec of decrementedProducts) {
              await menuRepository.incrementStockAtomic(dec.productId, dec.quantity);
            }
            throw {
              status: 409,
              code: 'INSUFFICIENT_STOCK',
              message: `Món "${menuItem.name}" không đủ số lượng tồn kho. Vui lòng thử lại.`,
              items: [{ productId: menuItem.id, name: menuItem.name, requestedQuantity: totalReqQty, availableQuantity: menuItem.stockQuantity }]
            };
          }
          decrementedProducts.push({ productId, quantity: totalReqQty });
        }
      }

      const totalDiscountAmount = subtotalAmount - totalAmount;
      const orderId = await generateOrderId(session);
      const actionToken = requestId;
      const newOrder = {
        id: orderId,
        requestId,
        fulfillmentType,
        customer,
        items: processedItems,
        subtotalAmount,
        discountAmount: totalDiscountAmount,
        totalAmount,
        orderStatus: 'CONFIRMED',
        notificationStatus: 'PENDING',
        telegramMessageId: null,
        notificationAttempts: 0,
        notificationError: null,
        isPaid: false,
        paymentMethod,
        paymentProvider: paymentMethod === 'CASH' ? 'MANUAL' : null,
        paymentStatus: paymentMethod === 'CASH' ? 'UNPAID' : 'PENDING',
        paymentReference: null,
        paymentTransactionId: null,
        paymentAmount: totalAmount,
        paymentExpiresAt: (fulfillmentType === 'DINE_IN' || config.getPaymentPendingScope() === 'ALL')
          ? new Date(Date.now() + config.getPaymentPendingTimeoutMinutes() * 60 * 1000).toISOString()
          : null,
        paymentQrImageUrl: null,
        paymentLink: null,
        paymentMock: false,
        cancelReason: null,
        cancelledAt: null,
        cancelledBy: null,
        retryOfOrderId: null,
        unpaidSlotReleased: false,
        orderActionTokenHash: hashOrderActionToken(actionToken),
        actionToken,
        paidAt: null,
        paidBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await orderRepository.save(newOrder, session);

      if (session) {
        await session.commitTransaction();
        session.endSession();
      }

      return await this.preparePaymentAndNotify(newOrder);

    } catch (err) {
      if (session) {
        try {
          await session.abortTransaction();
          session.endSession();
        } catch (e) {}
      }

      const isTxNotSupported = err && (
        err.code === 20 ||
        (err.message && (
          err.message.includes('Transaction numbers are only allowed') ||
          err.message.includes('Transactions are not supported') ||
          err.message.includes('replica set')
        ))
      );

      if (isTxNotSupported && allowTransaction) {
        console.warn('⚠️ MongoDB deployment does not support transactions. Falling back to non-transactional atomic operations.');
        return await this.processOrderMongoDB(requestId, customer, aggregatedItems, false, fulfillmentType, paymentMethod);
      }

      throw err;
    }
  }

  async processOrderJSON(requestId, customer, aggregatedItems, fulfillmentType = 'DELIVERY', paymentMethod = 'CASH') {
    const existingOrder = await orderRepository.findByRequestId(requestId);
    if (existingOrder) {
      return {
        statusCode: 200,
        result: {
          orderId: existingOrder.id,
          status: existingOrder.orderStatus,
          notificationStatus: existingOrder.notificationStatus,
          fulfillmentType: existingOrder.fulfillmentType || 'DELIVERY',
          createdAt: existingOrder.createdAt,
          total: existingOrder.totalAmount,
          payment: this.serializePayment(existingOrder)
        }
      };
    }

    const allItems = menuRepository.getFromFile();

    // Calculate total required quantity per productId
    const totalProductQuantityMap = new Map();
    for (const itemReq of aggregatedItems) {
      const curr = totalProductQuantityMap.get(itemReq.productId) || 0;
      totalProductQuantityMap.set(itemReq.productId, curr + itemReq.quantity);
    }

    const insufficientItems = [];
    for (const [productId, totalReqQty] of totalProductQuantityMap.entries()) {
      const menuItem = allItems.find(i => i.id === productId);
      if (!menuItem) {
        throw { status: 422, message: `Món ăn với mã ${productId} không tồn tại` };
      }
      if (menuItem.active === false) {
        throw { status: 422, message: `Món "${menuItem.name}" hiện đang tạm ngưng bán hôm nay` };
      }

      const stock = menuItem.stockQuantity ?? 0;
      if (stock < totalReqQty) {
        insufficientItems.push({
          productId: menuItem.id,
          name: menuItem.name,
          requestedQuantity: totalReqQty,
          availableQuantity: Math.max(0, stock)
        });
      }
    }

    if (insufficientItems.length > 0) {
      const first = insufficientItems[0];
      throw {
        status: 409,
        code: 'INSUFFICIENT_STOCK',
        message: `Món "${first.name}" chỉ còn ${first.availableQuantity} phần.`,
        items: insufficientItems
      };
    }

    const menuBackup = JSON.parse(JSON.stringify(allItems));

    try {
      const processedItems = [];
      let subtotalAmount = 0;
      let totalAmount = 0;

      for (const itemReq of aggregatedItems) {
        const menuItem = allItems.find(i => i.id === itemReq.productId);
        const originalUnitPrice = menuItem.price;
        const discountPercent = menuItem.discountPercent || 0;
        const unitPrice = calculateSalePrice(originalUnitPrice, discountPercent);
        const itemSubtotalBeforeDiscount = originalUnitPrice * itemReq.quantity;
        const itemTotal = unitPrice * itemReq.quantity;
        const discountAmount = itemSubtotalBeforeDiscount - itemTotal;

        subtotalAmount += itemSubtotalBeforeDiscount;
        totalAmount += itemTotal;

        // Options validation & snapshot creation
        const activeOptions = Array.isArray(menuItem.customizationOptions)
          ? menuItem.customizationOptions.filter(o => o.active !== false)
          : [];
        const activeOptMap = new Map(activeOptions.map(o => [o.id, o.name]));

        const excludedOptionsSnapshot = [];
        for (const exId of itemReq.excludedOptionIds) {
          const optName = activeOptMap.get(exId);
          if (!optName) {
            throw { status: 422, message: `Tùy chọn thành phần "${exId}" không hợp lệ hoặc không áp dụng cho món "${menuItem.name}"` };
          }
          excludedOptionsSnapshot.push({ id: exId, name: optName });
        }

        const excludedSet = new Set(itemReq.excludedOptionIds);
        const includedOptionsSnapshot = activeOptions
          .filter(o => !excludedSet.has(o.id))
          .map(o => ({ id: o.id, name: o.name }));

        processedItems.push({
          productId: menuItem.id,
          name: menuItem.name,
          originalUnitPrice,
          discountPercent,
          unitPrice,
          quantity: itemReq.quantity,
          discountAmount,
          itemSubtotalBeforeDiscount,
          itemTotal,
          customization: {
            excludedOptions: excludedOptionsSnapshot,
            includedOptions: includedOptionsSnapshot
          }
        });
      }

      // Decrement stock for total product quantity
      for (const [productId, totalReqQty] of totalProductQuantityMap.entries()) {
        const menuItem = allItems.find(i => i.id === productId);
        menuItem.stockQuantity -= totalReqQty;
      }

      menuRepository.saveAll(allItems);

      const totalDiscountAmount = subtotalAmount - totalAmount;
      const orderId = await generateOrderId();
      const actionToken = requestId;
      const newOrder = {
        id: orderId,
        requestId,
        fulfillmentType,
        customer,
        items: processedItems,
        subtotalAmount,
        discountAmount: totalDiscountAmount,
        totalAmount,
        orderStatus: 'CONFIRMED',
        notificationStatus: 'PENDING',
        telegramMessageId: null,
        notificationAttempts: 0,
        notificationError: null,
        isPaid: false,
        paymentMethod,
        paymentProvider: paymentMethod === 'CASH' ? 'MANUAL' : null,
        paymentStatus: paymentMethod === 'CASH' ? 'UNPAID' : 'PENDING',
        paymentReference: null,
        paymentTransactionId: null,
        paymentAmount: totalAmount,
        paymentExpiresAt: (fulfillmentType === 'DINE_IN' || config.getPaymentPendingScope() === 'ALL')
          ? new Date(Date.now() + config.getPaymentPendingTimeoutMinutes() * 60 * 1000).toISOString()
          : null,
        paymentQrImageUrl: null,
        paymentLink: null,
        paymentMock: false,
        cancelReason: null,
        cancelledAt: null,
        cancelledBy: null,
        retryOfOrderId: null,
        unpaidSlotReleased: false,
        orderActionTokenHash: hashOrderActionToken(actionToken),
        actionToken,
        paidAt: null,
        paidBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await orderRepository.save(newOrder);

      return await this.preparePaymentAndNotify(newOrder);

    } catch (err) {
      menuRepository.saveAll(menuBackup);
      throw err;
    }
  }

  serializePayment(order) {
    if (!order) return null;
    return {
      paymentMethod: order.paymentMethod || 'CASH',
      paymentProvider: order.paymentProvider || 'MANUAL',
      paymentStatus: order.paymentStatus || (order.isPaid ? 'PAID' : 'UNPAID'),
      paymentReference: order.paymentReference || null,
      paymentTransactionId: order.paymentTransactionId || null,
      paymentAmount: order.paymentAmount ?? order.totalAmount ?? 0,
      paymentExpiresAt: order.paymentExpiresAt || null,
      qrImageUrl: order.paymentQrImageUrl || null,
      paymentLink: order.paymentLink || null,
      isMock: order.paymentMock === true,
      mockCompletionEnabled: order.paymentMock === true && config.getPaymentMockEnabled()
    };
  }

  async preparePaymentAndNotify(newOrder) {
    const payment = await paymentService.createPaymentForOrder({
      orderId: newOrder.id,
      amount: newOrder.totalAmount,
      paymentMethod: newOrder.paymentMethod || 'CASH'
    });

    const paymentFields = {
      paymentMethod: payment.paymentMethod,
      paymentProvider: payment.paymentProvider,
      paymentStatus: payment.paymentStatus,
      paymentReference: payment.paymentReference,
      paymentTransactionId: payment.paymentTransactionId,
      paymentAmount: payment.paymentAmount,
      paymentExpiresAt: payment.paymentExpiresAt || newOrder.paymentExpiresAt || null,
      paymentQrImageUrl: payment.qrImageUrl,
      paymentLink: payment.paymentLink,
      paymentMock: payment.isMock === true
    };

    await orderRepository.update(newOrder.id, paymentFields);
    const response = await this.sendNotificationAndRespond({ ...newOrder, ...paymentFields });
    response.result.payment = { ...payment, paymentExpiresAt: paymentFields.paymentExpiresAt };
    response.result.paymentStatus = payment.paymentStatus;
    response.result.isPaid = payment.paymentStatus === 'PAID';
    response.result.actionToken = newOrder.actionToken || null;
    return response;
  }

  async sendNotificationAndRespond(newOrder) {
    if (!config.isTelegramOrderNotificationEnabled()) {
      return {
        statusCode: 201,
        result: {
          orderId: newOrder.id,
          status: 'CONFIRMED',
          fulfillmentType: newOrder.fulfillmentType,
          createdAt: newOrder.createdAt,
          total: newOrder.totalAmount
        }
      };
    }

    try {
      const result = await telegramService.notifyNewOrder(newOrder);
      await orderRepository.update(newOrder.id, {
        notificationStatus: 'SENT',
        telegramMessageId: result.messageId,
        notificationAttempts: 1
      });

      return {
        statusCode: 201,
        result: {
          orderId: newOrder.id,
          status: 'CONFIRMED',
          notificationStatus: 'SENT',
          fulfillmentType: newOrder.fulfillmentType,
          createdAt: newOrder.createdAt,
          total: newOrder.totalAmount
        }
      };
    } catch (telegramErr) {
      console.error(`[Telegram Error for Order ${newOrder.id}]:`, telegramErr.message);
      await orderRepository.update(newOrder.id, {
        notificationStatus: 'FAILED',
        notificationAttempts: 1,
        notificationError: telegramErr.message
      });

      return {
        statusCode: 202,
        result: {
          orderId: newOrder.id,
          status: 'CONFIRMED',
          notificationStatus: 'FAILED',
          fulfillmentType: newOrder.fulfillmentType,
          createdAt: newOrder.createdAt,
          total: newOrder.totalAmount,
          message: 'Đơn hàng đã được ghi nhận. Cửa hàng sẽ kiểm tra và xác nhận sớm nhất.'
        }
      };
    }
  }

  isPaymentCapacityScopeMatch(fulfillmentType) {
    return config.getPaymentPendingScope() === 'ALL' || fulfillmentType === 'DINE_IN';
  }

  async assertPaymentCapacity(fulfillmentType) {
    if (!this.isPaymentCapacityScopeMatch(fulfillmentType)) return;

    const limit = config.getPaymentPendingOrderLimit();
    const pendingCount = await orderRepository.countPendingPayments(config.getPaymentPendingScope());
    if (pendingCount < limit) return;

    await this.notifyPaymentCapacityBlocked(pendingCount, limit);
    throw {
      status: 409,
      code: 'PAYMENT_CAPACITY_FULL',
      message: 'Hệ thống hiện đang quá tải đơn chờ thanh toán. Vui lòng liên hệ chủ quán.',
      pendingCount,
      limit
    };
  }

  async getPaymentCapacityStatus() {
    await this._expireUnpaidOrders();
    const scope = config.getPaymentPendingScope();
    const limit = config.getPaymentPendingOrderLimit();
    const pendingCount = await orderRepository.countPendingPayments(scope);
    return {
      scope,
      pendingCount,
      limit,
      available: Math.max(0, limit - pendingCount),
      blocked: pendingCount >= limit,
      timeoutMinutes: config.getPaymentPendingTimeoutMinutes()
    };
  }

  async notifyPaymentCapacityBlocked(pendingCount, limit) {
    const now = Date.now();
    const cooldown = config.getPaymentCapacityAlertCooldownMinutes() * 60 * 1000;
    if (this.lastPaymentCapacityAlertAt && now - this.lastPaymentCapacityAlertAt < cooldown) return;
    this.lastPaymentCapacityAlertAt = now;

    try {
      await telegramService.notifyPaymentCapacityBlocked({
        pendingCount,
        limit,
        timeoutMinutes: config.getPaymentPendingTimeoutMinutes()
      });
    } catch (err) {
      // Payment capacity must still be enforced if Telegram is unavailable.
      console.warn('[Payment Capacity Alert]', err.message);
    }
  }

  async _expireUnpaidOrders() {
    const cutoff = new Date(Date.now() - config.getPaymentPendingTimeoutMinutes() * 60 * 1000);
    const scope = config.getPaymentPendingScope();
    const expiredOrders = await orderRepository.getPendingPaymentOrders({ scope, before: cutoff });
    const expired = [];

    for (const order of expiredOrders) {
      const updated = await this.cancelOrderInternal(order.id, {
        reason: 'PAYMENT_TIMEOUT',
        actor: { username: 'payment-timeout', role: 'system' },
        skipToken: true,
        paymentStatus: 'EXPIRED',
        notifyTelegram: true
      });
      if (updated && updated.orderStatus === 'CANCELLED') expired.push(updated);
    }

    return expired;
  }

  async expireUnpaidOrders() {
    return await runWithLock(() => this._expireUnpaidOrders());
  }

  verifyOrderActionToken(order, actionToken) {
    if (!order || !order.orderActionTokenHash || !actionToken) return false;
    const actual = hashOrderActionToken(actionToken);
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(order.orderActionTokenHash));
  }

  async restoreOrderStock(order) {
    const quantities = new Map();
    for (const item of (order.items || [])) {
      const productId = item.productId;
      const quantity = Number(item.quantity) || 0;
      if (!productId || quantity <= 0) continue;
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }
    for (const [productId, quantity] of quantities.entries()) {
      await menuRepository.incrementStockAtomic(productId, quantity);
    }
  }

  async cancelOrderInternal(orderId, options = {}) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw { status: 404, message: 'Không tìm thấy đơn hàng' };
    if (order.isPaid === true || order.paymentStatus === 'PAID') {
      if (options.reason === 'PAYMENT_TIMEOUT') return order;
      throw { status: 409, message: 'Không thể hủy đơn đã thanh toán' };
    }
    if (order.orderStatus === 'CANCELLED') return order;
    if (!options.skipToken && !this.verifyOrderActionToken(order, options.actionToken)) {
      throw { status: 403, message: 'Token thao tác đơn hàng không hợp lệ hoặc đã hết hạn' };
    }

    const cancelledAt = new Date().toISOString();
    const cancelledBy = options.actor || { userId: null, username: 'customer', role: 'system' };
    const updated = await orderRepository.transitionPendingOrder(orderId, {
      orderStatus: 'CANCELLED',
      paymentStatus: options.paymentStatus || 'CANCELLED',
      paymentQrImageUrl: null,
      paymentLink: null,
      cancelReason: options.reason || 'MANUAL_CANCEL',
      cancelledAt,
      cancelledBy,
      unpaidSlotReleased: true,
      updatedAt: cancelledAt
    });

    if (!updated) {
      const latest = await orderRepository.findById(orderId);
      if (latest?.isPaid === true) throw { status: 409, message: 'Đơn vừa được thanh toán, không thể hủy' };
      return latest || order;
    }

    if (order.unpaidSlotReleased !== true) {
      await this.restoreOrderStock(order);
    }

    if (options.notifyTelegram !== false && config.isTelegramOrderNotificationEnabled()) {
      try {
        await telegramService.notifyOrderCancelled({ ...order, ...updated });
      } catch (err) {
        console.warn(`[Telegram Cancel ${orderId}]`, err.message);
      }
    }

    return updated;
  }

  async cancelOrder(orderId, actionToken, actor = null) {
    return await runWithLock(() => this.cancelOrderInternal(orderId, {
      actionToken,
      actor: actor || { userId: null, username: 'customer', role: 'system' },
      reason: 'MANUAL_CANCEL',
      paymentStatus: 'CANCELLED'
    }));
  }

  async adminCancelOrder(orderId, actor) {
    return await runWithLock(() => this.cancelOrderInternal(orderId, {
      skipToken: true,
      actor: actor || { userId: null, username: 'admin', role: 'admin' },
      reason: 'ADMIN_CANCEL',
      paymentStatus: 'CANCELLED'
    }));
  }

  async retryOrder(orderId, actionToken, paymentMethod = null) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw { status: 404, message: 'Không tìm thấy đơn hàng' };
    if (!this.verifyOrderActionToken(order, actionToken)) {
      throw { status: 403, message: 'Token thao tác đơn hàng không hợp lệ hoặc đã hết hạn' };
    }
    if (order.orderStatus !== 'CANCELLED') {
      throw { status: 409, message: 'Chỉ có thể thanh toán lại đơn đã hủy' };
    }
    if (order.isPaid === true) {
      throw { status: 409, message: 'Đơn đã thanh toán, không cần thanh toán lại' };
    }

    const items = (order.items || []).map(item => ({
      productId: item.productId,
      quantity: Number(item.quantity) || 0,
      excludedOptionIds: (item.customization?.excludedOptions || []).map(option => option.id).filter(Boolean)
    }));
    const retryPaymentMethod = ['CASH', 'BANK_QR', 'MOMO_QR'].includes(paymentMethod)
      ? paymentMethod
      : (order.paymentMethod || 'CASH');
    const requestId = crypto.randomUUID();

    const result = await this.processOrder({
      requestId,
      fulfillmentType: 'DINE_IN',
      paymentMethod: retryPaymentMethod,
      customer: {
        name: order.customer?.name || '',
        phone: order.customer?.phone || '',
        address: '',
        note: order.customer?.note || ''
      },
      items
    });

    await orderRepository.update(result.result.orderId, { retryOfOrderId: order.id });
    result.result.retryOfOrderId = order.id;
    return result;
  }

  async setPaymentStatus(orderId, isPaid, actor) {
    if (typeof isPaid !== 'boolean') {
      throw { status: 400, message: 'Trạng thái isPaid phải là kiểu boolean' };
    }

    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw { status: 404, message: 'Không tìm thấy đơn hàng' };
    }

    if (order.orderStatus === 'CANCELLED') {
      throw { status: 409, message: 'Không thể cập nhật thanh toán cho đơn đã hủy' };
    }

    if (order.isPaid === isPaid) {
      return order;
    }

    const paymentData = isPaid
      ? {
          isPaid: true,
          paymentStatus: 'PAID',
          paidAt: new Date().toISOString(),
          paidBy: {
            userId: actor?.sub || actor?.userId || null,
            username: actor?.username || null,
            role: actor?.role || null
          },
          unpaidSlotReleased: true
        }
      : {
          isPaid: false,
          paymentStatus: order.paymentMethod && order.paymentMethod !== 'CASH' ? 'PENDING' : 'UNPAID',
          paidAt: null,
          paidBy: null,
          unpaidSlotReleased: false
        };

    const updated = await orderRepository.updatePaymentStatus(orderId, paymentData);
    return updated;
  }

  async completeMockPayment(orderId, actor = null) {
    if (!config.getPaymentMockEnabled()) {
      throw { status: 403, message: 'Mock payment đang bị tắt. Chỉ bật trong môi trường test.' };
    }

    const order = await orderRepository.findById(orderId);
    if (!order) throw { status: 404, message: 'Không tìm thấy đơn hàng' };
    if (!['BANK_QR', 'MOMO_QR'].includes(order.paymentMethod)) {
      throw { status: 422, message: 'Đơn hàng này không dùng thanh toán QR' };
    }
    if (order.paymentMock !== true) {
      throw { status: 409, message: 'Đơn hàng đang dùng QR thật, không thể dùng mock bypass' };
    }
    if (order.orderStatus === 'CANCELLED') {
      throw { status: 409, message: 'Đơn hàng đã hủy, QR test không còn hiệu lực' };
    }
    if (order.isPaid === true) return order;

    return await orderRepository.transitionPendingOrder(orderId, {
      isPaid: true,
      paymentStatus: 'PAID',
      paymentProvider: 'MOCK',
      paymentTransactionId: `MOCK-${Date.now()}`,
      paidAt: new Date().toISOString(),
      paidBy: {
        userId: actor?.sub || null,
        username: actor?.username || 'mock-test',
        role: actor?.role || 'system'
      },
      unpaidSlotReleased: true
    });
  }

  async handleMomoIpn(payload) {
    if (!paymentService.verifyMomoIpn(payload)) {
      throw { status: 400, message: 'Chữ ký IPN MoMo không hợp lệ' };
    }

    const order = await orderRepository.findById(payload.orderId);
    if (!order) throw { status: 404, message: 'Không tìm thấy đơn hàng MoMo' };
    if (order.orderStatus === 'CANCELLED') return order;
    if (Number(payload.amount) !== Number(order.totalAmount)) {
      throw { status: 422, message: 'Số tiền IPN MoMo không khớp với đơn hàng' };
    }
    if (Number(payload.resultCode) !== 0 || order.isPaid === true) return order;

    return await orderRepository.transitionPendingOrder(order.id, {
      isPaid: true,
      paymentStatus: 'PAID',
      paymentProvider: 'MOMO',
      paymentTransactionId: String(payload.transId || ''),
      paidAt: new Date().toISOString(),
      paidBy: { userId: null, username: 'momo-ipn', role: 'system' },
      unpaidSlotReleased: true
    });
  }

  async getOrderStatus(orderId) {
    const order = await orderRepository.findById(orderId);
    if (!order) return null;
    return {
      orderId: order.id,
      orderStatus: order.orderStatus,
      notificationStatus: order.notificationStatus,
      fulfillmentType: order.fulfillmentType || 'DELIVERY',
      total: order.totalAmount,
      isPaid: order.isPaid === true,
      paidAt: order.paidAt || null,
      paidBy: order.paidBy || null,
      cancelReason: order.cancelReason || null,
      cancelledAt: order.cancelledAt || null,
      retryOfOrderId: order.retryOfOrderId || null,
      payment: this.serializePayment(order),
      createdAt: order.createdAt
    };
  }

  async getAllOrders(options = {}) {
    const parsedPage = Number.parseInt(options.page, 10);
    const parsedLimit = Number.parseInt(options.limit, 10);

    const page = Number.isInteger(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 10;

    return await orderRepository.getPaginated({ page, limit });
  }
}

module.exports = new OrderService();
