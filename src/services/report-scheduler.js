const { DateTime } = require('luxon');
const config = require('../config');
const reportService = require('./report-service');
const telegramBotService = require('./telegram-bot-service');
const tenantTelegramBotService = require('./tenant-telegram-bot-service');
const { isDBConnected } = require('../db');
const { BranchModel, TelegramDeliveryLogModel } = require('../models');
const { getEffectiveSettings } = require('./tenant-telegram-settings-service');

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
    await telegramBotService.sendSalesReport(config.getTelegramChatId(), report);
  } catch (err) {
    sentKeys.delete(key);
    console.warn(`[Report Scheduler] ${period} report failed:`, err.message);
  }
}

async function sendTenantScheduledReport(period, referenceDate, branch, settings, key) {
  const recipients = settings.recipientChatIds || [];
  for (const recipientChatId of recipients) {
    const deliveryKey = `${branch.storeId}:${branch.id}:${period}:${key}:${recipientChatId}`;
    if (sentKeys.has(deliveryKey)) continue;
    if (isDBConnected()) {
      const existing = await TelegramDeliveryLogModel.findOne({
        storeId: branch.storeId,
        branchId: branch.id,
        reportType: period,
        periodKey: key,
        recipientChatId
      }).lean();
      if (existing?.status === 'SENT') {
        sentKeys.add(deliveryKey);
        continue;
      }
    }
    try {
      const tenantContext = { storeId: branch.storeId, branchId: branch.id };
      const report = await reportService.generateSalesReport(period, referenceDate, tenantContext);
      const result = await tenantTelegramBotService.sendReport(recipientChatId, report, settings);
      sentKeys.add(deliveryKey);
      if (isDBConnected()) {
        await TelegramDeliveryLogModel.updateOne(
          { storeId: branch.storeId, branchId: branch.id, reportType: period, periodKey: key, recipientChatId },
          { $set: { status: 'SENT', telegramMessageId: result?.messageId || null, sentAt: new Date(), error: null } },
          { upsert: true }
        );
      }
    } catch (err) {
      if (isDBConnected()) {
        await TelegramDeliveryLogModel.updateOne(
          { storeId: branch.storeId, branchId: branch.id, reportType: period, periodKey: key, recipientChatId },
          { $set: { status: 'FAILED', error: err.message, sentAt: new Date() } },
          { upsert: true }
        ).catch(() => {});
      }
      console.warn(`[Report Scheduler] ${period} report for ${branch.storeId}/${branch.id} failed:`, err.message);
    }
  }
}

async function runTenantSchedules() {
  if (!isDBConnected()) return false;
  const branches = await BranchModel.find({ status: 'ACTIVE' }).lean();
  for (const branch of branches) {
    const settings = await getEffectiveSettings({ storeId: branch.storeId, branchId: branch.id });
    if (!settings.enabled || !settings.scheduledReportEnabled) continue;
    const now = DateTime.now().setZone(settings.timezone || 'Asia/Ho_Chi_Minh');
    const dateKey = now.toFormat('yyyy-LL-dd');
    if (settings.dailyReportEnabled && timeMatches(now, settings.dailyReportTime)) {
      await sendTenantScheduledReport('today', now.toJSDate(), branch, settings, `daily:${dateKey}`);
    }
    if (settings.weeklyReportEnabled && now.weekday === 1 && timeMatches(now, settings.weeklyReportTime)) {
      await sendTenantScheduledReport('week', now.minus({ days: 1 }).toJSDate(), branch, settings, `weekly:${dateKey}`);
    }
    if (settings.monthlyReportEnabled && now.day === 1 && timeMatches(now, settings.monthlyReportTime)) {
      await sendTenantScheduledReport('month', now.minus({ days: 1 }).toJSDate(), branch, settings, `monthly:${dateKey}`);
    }
  }
  return true;
}

function startReportScheduler() {
  if (timer || (!isDBConnected() && !config.getReportScheduleEnabled())) return timer;
  const times = config.getReportScheduleTimes();
  const timezone = config.ORDER_TIMEZONE || 'Asia/Ho_Chi_Minh';

  const run = async () => {
    if (isDBConnected()) {
      await runTenantSchedules();
      return;
    }
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

module.exports = { startReportScheduler, stopReportScheduler, runTenantSchedules };
