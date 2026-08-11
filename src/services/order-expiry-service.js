const orderService = require('./order-service');

const INTERVAL_MS = 30 * 1000;
let timer = null;

function startOrderExpiryJob() {
  if (timer) return timer;

  const run = async () => {
    try {
      const expired = await orderService.expireUnpaidOrders();
      if (expired.length > 0) {
        console.log(`[Payment Expiry] Auto-cancelled ${expired.length} unpaid order(s).`);
      }
    } catch (err) {
      console.error('[Payment Expiry] Failed:', err.message);
    }
  };

  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
  run();
  return timer;
}

function stopOrderExpiryJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startOrderExpiryJob, stopOrderExpiryJob };
