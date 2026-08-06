const { z } = require('zod');
const orderRepository = require('../repositories/order-repository');
const menuService = require('./menu-service');
const telegramService = require('./telegram-service');

// Zod validation schema for incoming order payload
const OrderSchema = z.object({
  requestId: z.string().min(1, 'requestId là bắt buộc'),
  customer: z.object({
    name: z.string().min(1, 'Tên khách hàng là bắt buộc'),
    phone: z.string().min(8, 'Số điện thoại không hợp lệ'),
    address: z.string().min(1, 'Địa chỉ giao hàng là bắt buộc'),
    note: z.string().optional().default('')
  }),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().positive('Số lượng phải lớn hơn 0')
    })
  ).min(1, 'Đơn hàng phải chứa ít nhất 1 món')
});

let sequence = 1;

function generateOrderId() {
  const dateObj = new Date();
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const seqStr = String(sequence++).padStart(4, '0');
  return `FO-${year}${month}${day}-${seqStr}`;
}

class OrderService {
  async processOrder(rawPayload) {
    // 1. Validate payload schema
    const parseResult = OrderSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map(e => e.message).join(', ');
      throw { status: 422, message: `Dữ liệu không hợp lệ: ${errorMsg}` };
    }

    const { requestId, customer, items } = parseResult.data;

    // 2. Check Idempotency via requestId
    const existingOrder = orderRepository.findByRequestId(requestId);
    if (existingOrder) {
      console.log(`[Idempotency] Duplicate request found for requestId ${requestId}. Returning cached order ${existingOrder.id}`);
      return {
        statusCode: 200,
        result: {
          orderId: existingOrder.id,
          status: existingOrder.orderStatus,
          notificationStatus: existingOrder.notificationStatus,
          total: existingOrder.totalAmount
        }
      };
    }

    // 3. Server-side price calculation
    let calculatedTotal = 0;
    const processedItems = [];

    for (const itemReq of items) {
      const menuItem = menuService.getMenuItem(itemReq.productId);
      if (!menuItem) {
        throw { status: 422, message: `Món ăn với mã ${itemReq.productId} không tồn tại` };
      }
      if (menuItem.active === false) {
        throw { status: 422, message: `Món ${menuItem.name} hiện đang tạm ngưng bán hôm nay` };
      }

      const itemTotal = menuItem.price * itemReq.quantity;
      calculatedTotal += itemTotal;

      processedItems.push({
        productId: menuItem.id,
        name: menuItem.name,
        unitPrice: menuItem.price,
        quantity: itemReq.quantity,
        itemTotal: itemTotal
      });
    }

    // 4. Generate order ID and save order as SAVED
    const orderId = generateOrderId();
    const newOrder = {
      id: orderId,
      requestId,
      customer,
      items: processedItems,
      totalAmount: calculatedTotal,
      orderStatus: 'CONFIRMED',
      notificationStatus: 'PENDING',
      telegramMessageId: null,
      notificationAttempts: 0,
      notificationError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    orderRepository.save(newOrder);

    // 5. Trigger Telegram Notification
    try {
      const result = await telegramService.notifyNewOrder(newOrder);
      orderRepository.update(orderId, {
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
          total: calculatedTotal
        }
      };
    } catch (telegramErr) {
      console.error(`[Telegram Error for Order ${orderId}]:`, telegramErr.message);
      orderRepository.update(orderId, {
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
          total: calculatedTotal,
          message: 'Đơn hàng đã được ghi nhận. Cửa hàng sẽ kiểm tra và xác nhận sớm nhất.'
        }
      };
    }
  }

  getOrderStatus(orderId) {
    const order = orderRepository.findById(orderId);
    if (!order) return null;
    return {
      orderId: order.id,
      orderStatus: order.orderStatus,
      notificationStatus: order.notificationStatus,
      total: order.totalAmount,
      createdAt: order.createdAt
    };
  }

  getAllOrders() {
    return orderRepository.getAll();
  }
}

module.exports = new OrderService();
