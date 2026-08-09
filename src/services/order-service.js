const { z } = require('zod');
const mongoose = require('mongoose');
const orderRepository = require('../repositories/order-repository');
const menuRepository = require('../repositories/menu-repository');
const menuService = require('./menu-service');
const telegramService = require('./telegram-service');
const { calculateSalePrice } = require('../utils/price-calculator');
const { isDBConnected } = require('../db');
const config = require('../config');

const OrderSchema = z.object({
  requestId: z.string().min(1, 'requestId là bắt buộc'),
  fulfillmentType: z.enum(['DELIVERY', 'DINE_IN']).default('DELIVERY'),
  customer: z.object({
    name: z.string().min(1, 'Tên khách hàng là bắt buộc'),
    phone: z.string()
      .transform(val => (typeof val === 'string' ? val.replace(/[\s.-]/g, '') : val))
      .refine(val => /^0\d{9}$/.test(val), { message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0' }),
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
  if (data.fulfillmentType === 'DELIVERY') {
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

class OrderService {
  async processOrder(rawPayload) {
    // 1. Validate payload schema
    const parseResult = OrderSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map(e => e.message).join(', ');
      throw { status: 422, message: `Dữ liệu không hợp lệ: ${errorMsg}` };
    }

    const { requestId, fulfillmentType, customer, items: rawItems } = parseResult.data;

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
          total: existingOrder.totalAmount
        }
      };
    }

    // 4. Branch logic based on MongoDB vs JSON file mode
    if (isDBConnected()) {
      return await this.processOrderMongoDB(requestId, customer, aggregatedItems, true, fulfillmentType);
    } else {
      return await runWithLock(() => this.processOrderJSON(requestId, customer, aggregatedItems, fulfillmentType));
    }
  }

  async processOrderMongoDB(requestId, customer, aggregatedItems, allowTransaction = true, fulfillmentType = 'DELIVERY') {
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
          total: existingOrder.totalAmount
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

      return await this.sendNotificationAndRespond(newOrder);

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
        return await this.processOrderMongoDB(requestId, customer, aggregatedItems, false, fulfillmentType);
      }

      throw err;
    }
  }

  async processOrderJSON(requestId, customer, aggregatedItems, fulfillmentType = 'DELIVERY') {
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
          total: existingOrder.totalAmount
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
        paidAt: null,
        paidBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await orderRepository.save(newOrder);

      return await this.sendNotificationAndRespond(newOrder);

    } catch (err) {
      menuRepository.saveAll(menuBackup);
      throw err;
    }
  }

  async sendNotificationAndRespond(newOrder) {
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

  async setPaymentStatus(orderId, isPaid, actor) {
    if (typeof isPaid !== 'boolean') {
      throw { status: 400, message: 'Trạng thái isPaid phải là kiểu boolean' };
    }

    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw { status: 404, message: 'Không tìm thấy đơn hàng' };
    }

    if (order.isPaid === isPaid) {
      return order;
    }

    const paymentData = isPaid
      ? {
          isPaid: true,
          paidAt: new Date().toISOString(),
          paidBy: {
            userId: actor?.sub || actor?.userId || null,
            username: actor?.username || null,
            role: actor?.role || null
          }
        }
      : {
          isPaid: false,
          paidAt: null,
          paidBy: null
        };

    const updated = await orderRepository.updatePaymentStatus(orderId, paymentData);
    return updated;
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

