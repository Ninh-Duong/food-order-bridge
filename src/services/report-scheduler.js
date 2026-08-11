const { DateTime } = require('luxon');
const config = require('../config');
const reportService = require('./report-service');
const telegramClient = require('../integrations/telegram-client');
const { formatSalesReport } = require('./telegram-report-formatter');

let timer = null;
const sentKeys = new Set();

function timeMatches(current, value) {
  return current.toFormat('HH:mm') === value;
}

async function sendScheduledReport(period, referenceDate, key) {
  if (sentKeys.has(key)) return;
  sentKeys.add(key);
  try {
    const report = await reportService.generateSalesReport(period, referenceDate);
    await telegramClient.sendTelegramMessage({
      text: formatSalesReport(report),
      parseMode: 'HTML'
    });
  } catch (err) {
    sentKeys.delete(key);
    console.warn(`[Report Scheduler] ${period} report failed:`, err.message);
  }
}

function startReportScheduler() {
  if (timer || !config.getReportScheduleEnabled()) return timer;
  const times = config.getReportScheduleTimes();
  const timezone = config.ORDER_TIMEZONE || 'Asia/Ho_Chi_Minh';

  const run = async () => {
    const now = DateTime.now().setZone(timezone);
    const dateKey = now.toFormat('yyyy-LL-dd');

    if (timeMatches(now, times.daily)) {
      await sendScheduledReport('today', now.toJSDate(), `daily:${dateKey}`);
    }
    if (now.weekday === 1 && timeMatches(now, times.weekly)) {
      await sendScheduledReport('week', now.minus({ days: 1 }).toJSDate(), `weekly:${dateKey}`);
    }
    if (now.day === 1 && timeMatches(now, times.monthly)) {
      await sendScheduledReport('month', now.minus({ days: 1 }).toJSDate(), `monthly:${dateKey}`);
    }

    // Keep the in-memory idempotency set bounded.
    if (sentKeys.size > 100) {
      const first = sentKeys.values().next().value;
      sentKeys.delete(first);
    }
  };

  timer = setInterval(run, 60 * 1000);
  timer.unref?.();
  return timer;
}

function stopReportScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  sentKeys.clear();
}

module.exports = { startReportScheduler, stopReportScheduler };
