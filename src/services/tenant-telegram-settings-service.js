const crypto = require('crypto');
const config = require('../config');
const { isDBConnected } = require('../db');
const {
  TelegramSettingsModel,
  TelegramReportAccessModel
} = require('../models');

const memorySettings = new Map();
const memoryAccess = new Map();

const SETTING_FIELDS = [
  'enabled', 'chatId', 'recipientChatIds', 'orderCreatedEnabled', 'orderCancelledEnabled',
  'pendingOrderAlertEnabled', 'inventoryAlertEnabled', 'scheduledReportEnabled',
  'dailyReportEnabled', 'weeklyReportEnabled', 'monthlyReportEnabled', 'chartEnabled',
  'dailyReportTime', 'weeklyReportTime', 'monthlyReportTime', 'timezone', 'lowStockThreshold',
  'pendingOrderLimit', 'pendingTimeoutMinutes', 'pendingScope', 'alertCooldownMinutes'
];

function assertTenantContext({ storeId, branchId = null } = {}) {
  if (!storeId || typeof storeId !== 'string') {
    const error = new Error('Thiếu tenant context: storeId là bắt buộc');
    error.code = 'TENANT_CONTEXT_MISSING';
    throw error;
  }
  return { storeId, branchId: branchId || null };
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(
    process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY
      || process.env.AUTH_SECRET
      || process.env.SUPER_ADMIN_AUTH_SECRET
      || 'local-telegram-config-encryption-key'
  ).digest();
}

function encryptSecret(value) {
  if (!value) return '';
  if (String(value).startsWith('enc:v1:')) return String(value);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptSecret(value) {
  if (!value) return '';
  if (!String(value).startsWith('enc:v1:')) return String(value);
  try {
    const [, version, ivRaw, tagRaw, dataRaw] = String(value).split(':');
    if (version !== 'v1') return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) {
    return '';
  }
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '••••••••';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function scopeKey(storeId, branchId = null) {
  return `${storeId}::${branchId || '__STORE_DEFAULT__'}`;
}

function getLegacyDefaults() {
  const times = config.getReportScheduleTimes();
  return {
    enabled: Boolean(config.getTelegramToken() && config.getTelegramChatId()),
    chatId: config.getTelegramChatId(),
    recipientChatIds: config.getTelegramChatId() ? [config.getTelegramChatId()] : [],
    orderCreatedEnabled: config.isTelegramOrderNotificationEnabled(),
    orderCancelledEnabled: config.isTelegramOrderNotificationEnabled(),
    pendingOrderAlertEnabled: config.isTelegramOrderNotificationEnabled(),
    inventoryAlertEnabled: true,
    scheduledReportEnabled: config.getReportScheduleEnabled(),
    dailyReportEnabled: true,
    weeklyReportEnabled: true,
    monthlyReportEnabled: true,
    chartEnabled: config.getReportChartEnabled(),
    dailyReportTime: times.daily,
    weeklyReportTime: times.weekly,
    monthlyReportTime: times.monthly,
    timezone: config.ORDER_TIMEZONE || 'Asia/Ho_Chi_Minh',
    lowStockThreshold: config.getLowStockThreshold(),
    pendingOrderLimit: config.getPaymentPendingOrderLimit(),
    pendingTimeoutMinutes: config.getPaymentPendingTimeoutMinutes(),
    pendingScope: config.getPaymentPendingScope(),
    alertCooldownMinutes: config.getPaymentCapacityAlertCooldownMinutes()
  };
}

function sanitizePayload(payload = {}) {
  const result = {};
  for (const field of SETTING_FIELDS) {
    if (payload[field] !== undefined) result[field] = payload[field];
  }

  if (result.chatId !== undefined) result.chatId = String(result.chatId || '').trim();
  if (result.recipientChatIds !== undefined) {
    if (!Array.isArray(result.recipientChatIds)) throw new Error('Danh sách Chat ID phải là mảng');
    result.recipientChatIds = [...new Set(result.recipientChatIds.map(id => String(id).trim()).filter(Boolean))];
  }

  for (const field of ['enabled', 'orderCreatedEnabled', 'orderCancelledEnabled', 'pendingOrderAlertEnabled', 'inventoryAlertEnabled', 'scheduledReportEnabled', 'dailyReportEnabled', 'weeklyReportEnabled', 'monthlyReportEnabled', 'chartEnabled']) {
    if (result[field] !== undefined) result[field] = Boolean(result[field]);
  }

  for (const field of ['lowStockThreshold', 'pendingOrderLimit', 'pendingTimeoutMinutes', 'alertCooldownMinutes']) {
    if (result[field] !== undefined) {
      const value = Number(result[field]);
      const min = field === 'alertCooldownMinutes' ? 0 : 1;
      if (!Number.isInteger(value) || value < min) throw new Error(`${field} không hợp lệ`);
      result[field] = value;
    }
  }

  if (result.pendingScope !== undefined) {
    result.pendingScope = String(result.pendingScope).toUpperCase();
    if (!['ALL', 'DINE_IN'].includes(result.pendingScope)) throw new Error('pendingScope không hợp lệ');
  }

  for (const field of ['dailyReportTime', 'weeklyReportTime', 'monthlyReportTime']) {
    if (result[field] !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(result[field]))) {
      throw new Error(`${field} phải có định dạng HH:mm`);
    }
  }
  if (result.timezone !== undefined && !String(result.timezone).trim()) throw new Error('timezone không được để trống');
  return result;
}

async function findSettings(storeId, branchId = null) {
  assertTenantContext({ storeId, branchId });
  if (isDBConnected()) {
    return TelegramSettingsModel.findOne({ storeId, branchId: branchId || null }).lean();
  }
  return memorySettings.get(scopeKey(storeId, branchId)) || null;
}

async function getEffectiveSettings({ storeId, branchId = null } = {}) {
  assertTenantContext({ storeId, branchId });
  const storeSettings = await findSettings(storeId, null);
  const branchSettings = branchId ? await findSettings(storeId, branchId) : null;
  const base = getLegacyDefaults();
  const branchPatch = branchSettings && Array.isArray(branchSettings.overrideFields)
    ? Object.fromEntries(branchSettings.overrideFields.filter(field => branchSettings[field] !== undefined).map(field => [field, branchSettings[field]]))
    : (branchSettings || {});
  const merged = { ...base, ...(storeSettings || {}), ...branchPatch };
  const branchOwnsToken = branchSettings && (!Array.isArray(branchSettings.overrideFields) || branchSettings.overrideFields.includes('botTokenEncrypted'));
  const branchOwnsWebhook = branchSettings && (!Array.isArray(branchSettings.overrideFields) || branchSettings.overrideFields.includes('webhookSecretEncrypted'));
  const token = decryptSecret(branchOwnsToken ? branchSettings.botTokenEncrypted : storeSettings?.botTokenEncrypted) || config.getTelegramToken();
  const webhookSecret = decryptSecret(branchOwnsWebhook ? branchSettings.webhookSecretEncrypted : storeSettings?.webhookSecretEncrypted) || config.getTelegramWebhookSecret();
  const recipientChatIds = [...new Set([
    ...(Array.isArray(merged.recipientChatIds) ? merged.recipientChatIds : []),
    ...(merged.chatId ? [String(merged.chatId)] : [])
  ])];
  return {
    ...merged,
    storeId,
    branchId: branchId || null,
    token,
    webhookSecret,
    recipientChatIds,
    source: branchSettings ? 'BRANCH_OVERRIDE' : storeSettings ? 'STORE' : 'LEGACY_FALLBACK'
  };
}

async function upsertSettings({ storeId, branchId = null, payload = {}, actorId = null } = {}) {
  assertTenantContext({ storeId, branchId });
  const data = sanitizePayload(payload);
  const existing = branchId ? await findSettings(storeId, branchId) : null;
  const overrideFields = branchId
    ? [...new Set([...(existing?.overrideFields || []), ...Object.keys(data)])]
    : [];
  const update = { ...data, ...(branchId ? { overrideFields } : {}), updatedBy: actorId, updatedAt: new Date() };
  if (payload.telegramBotToken !== undefined && payload.telegramBotToken !== '' && !String(payload.telegramBotToken).includes('...')) {
    update.botTokenEncrypted = encryptSecret(payload.telegramBotToken);
    if (branchId) update.overrideFields = [...new Set([...(update.overrideFields || []), 'botTokenEncrypted'])];
  }
  if (payload.telegramWebhookSecret !== undefined && payload.telegramWebhookSecret !== '' && !String(payload.telegramWebhookSecret).includes('...')) {
    update.webhookSecretEncrypted = encryptSecret(payload.telegramWebhookSecret);
    if (branchId) update.overrideFields = [...new Set([...(update.overrideFields || []), 'webhookSecretEncrypted'])];
  }
  if (payload.telegramBotToken === '') update.botTokenEncrypted = '';
  if (payload.telegramWebhookSecret === '') update.webhookSecretEncrypted = '';

  if (isDBConnected()) {
    return TelegramSettingsModel.findOneAndUpdate(
      { storeId, branchId: branchId || null },
      { $set: update, $setOnInsert: { storeId, branchId: branchId || null, createdAt: new Date() } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
  }

  const key = scopeKey(storeId, branchId);
  const current = memorySettings.get(key) || { storeId, branchId: branchId || null, ...getLegacyDefaults() };
  const next = { ...current, ...update, storeId, branchId: branchId || null };
  memorySettings.set(key, next);
  return next;
}

async function resetBranchSettings({ storeId, branchId } = {}) {
  assertTenantContext({ storeId, branchId });
  if (!branchId) throw new Error('branchId là bắt buộc khi reset cấu hình branch');
  if (isDBConnected()) {
    await TelegramSettingsModel.deleteOne({ storeId, branchId });
  } else {
    memorySettings.delete(scopeKey(storeId, branchId));
  }
  return getEffectiveSettings({ storeId, branchId });
}

async function serializeSettings(settings) {
  const token = settings.token || decryptSecret(settings.botTokenEncrypted);
  const webhookSecret = settings.webhookSecret || decryptSecret(settings.webhookSecretEncrypted);
  const result = { ...settings };
  delete result.botTokenEncrypted;
  delete result.webhookSecretEncrypted;
  delete result.token;
  delete result.webhookSecret;
  return {
    ...result,
    telegramBotToken: maskSecret(token),
    telegramWebhookSecret: maskSecret(webhookSecret),
    hasBotToken: Boolean(token),
    hasWebhookSecret: Boolean(webhookSecret)
  };
}

async function listReportAccess({ storeId, branchId = null } = {}) {
  assertTenantContext({ storeId, branchId });
  if (isDBConnected()) {
    return TelegramReportAccessModel.find({ storeId, branchId: branchId || null, active: true }).sort({ telegramUserId: 1 }).lean();
  }
  return memoryAccess.get(scopeKey(storeId, branchId)) || [];
}

async function replaceReportAccess({ storeId, branchId = null, users = [], actorId = null } = {}) {
  assertTenantContext({ storeId, branchId });
  if (!Array.isArray(users)) throw new Error('Danh sách người dùng report phải là mảng');
  const accessPairs = users.map(item => {
    const telegramUserId = String(item.telegramUserId ?? item.userId ?? item).trim();
    return [telegramUserId, {
      telegramUserId,
      storeId,
      branchId: branchId || null,
      canViewReports: item?.canViewReports !== false,
      canReceiveAlerts: item?.canReceiveAlerts !== false,
      active: true,
      createdBy: actorId,
      updatedAt: new Date()
    }];
  }).filter(([id]) => id);
  const normalized = [...new Map(accessPairs).values()];

  if (isDBConnected()) {
    await TelegramReportAccessModel.deleteMany({ storeId, branchId: branchId || null });
    if (normalized.length) await TelegramReportAccessModel.insertMany(normalized);
  } else {
    memoryAccess.set(scopeKey(storeId, branchId), normalized);
  }
  return normalized;
}

async function getEffectiveReportAccess({ storeId, branchId = null } = {}) {
  const branch = branchId ? await listReportAccess({ storeId, branchId }) : [];
  if (branch.length) return branch;
  return listReportAccess({ storeId, branchId: null });
}

async function bootstrapLegacyTelegramSettings() {
  if (!isDBConnected()) return { migrated: false, reason: 'DB_DISCONNECTED' };
  const storeId = process.env.DEFAULT_STORE_ID || 'legacy-store';
  const branchId = process.env.DEFAULT_BRANCH_ID || 'legacy-main-branch';
  const existing = await findSettings(storeId, branchId);
  if (!existing) {
    const defaults = getLegacyDefaults();
    await upsertSettings({
      storeId,
      branchId,
      payload: {
        ...defaults,
        telegramBotToken: config.getTelegramToken(),
        telegramWebhookSecret: config.getTelegramWebhookSecret()
      },
      actorId: 'system-migration'
    });
  }
  const adminIds = config.getTelegramAdminUserIds();
  if (adminIds.length && (await listReportAccess({ storeId, branchId })).length === 0) {
    await replaceReportAccess({ storeId, branchId, users: adminIds, actorId: 'system-migration' });
  }
  return { migrated: !existing, storeId, branchId };
}

module.exports = {
  assertTenantContext,
  encryptSecret,
  decryptSecret,
  maskSecret,
  getEffectiveSettings,
  findSettings,
  upsertSettings,
  resetBranchSettings,
  serializeSettings,
  listReportAccess,
  replaceReportAccess,
  getEffectiveReportAccess,
  bootstrapLegacyTelegramSettings,
  sanitizePayload
};
