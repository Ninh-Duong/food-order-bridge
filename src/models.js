const mongoose = require('mongoose');

// --- Multi-Tenant Core Schemas ---

const storeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', lowercase: true, trim: true },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
  primaryOwnerId: { type: String, default: null },
  plan: { type: String, enum: ['FREE', 'PRO', 'ENTERPRISE'], default: 'FREE' },
  maxBranches: { type: Number, default: 5 },
  featureFlags: { type: Map, of: Boolean, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const branchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, trim: true },
  storeId: { type: String, required: true, index: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

branchSchema.index({ storeId: 1, code: 1 }, { unique: true });
branchSchema.index({ storeId: 1, slug: 1 }, { unique: true });

const branchInventorySchema = new mongoose.Schema({
  storeId: { type: String, required: true, index: true, trim: true },
  branchId: { type: String, required: true, index: true, trim: true },
  menuItemId: { type: String, required: true, uppercase: true, trim: true },
  stockQuantity: { type: Number, required: true, min: 0, default: 0 },
  priceOverride: { type: Number, default: null, min: 0 },
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});

branchInventorySchema.index({ storeId: 1, branchId: 1, menuItemId: 1 }, { unique: true });

const auditLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  actorId: { type: String, default: null },
  actorRole: { type: String, default: null },
  storeId: { type: String, default: null, index: true },
  branchId: { type: String, default: null, index: true },
  action: { type: String, required: true },
  target: { type: String, default: '' },
  details: { type: Object, default: {} },
  timestamp: { type: Date, default: Date.now, index: true }
});

// --- Existing Business Schemas (Scoped with storeId & branchId) ---

const categorySchema = new mongoose.Schema({
  storeId: { type: String, default: 'legacy-store', index: true, trim: true },
  id: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true },
  description: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

categorySchema.index({ storeId: 1, id: 1 }, { unique: true });
categorySchema.index({ storeId: 1, slug: 1 }, { unique: true });

const menuItemSchema = new mongoose.Schema({
  storeId: { type: String, default: 'legacy-store', index: true, trim: true },
  id: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  categoryId: { type: String, trim: true, uppercase: true },
  category: { type: String, default: 'Món chính' },
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number },
  discountPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  stockQuantity: { type: Number, required: true, min: 0, default: 0 },
  customizationOptions: [{
    id: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    defaultIncluded: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  }],
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  isBestseller: { type: Boolean, default: false },
  isSpicy: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});

menuItemSchema.index({ storeId: 1, id: 1 }, { unique: true });

const paidBySchema = new mongoose.Schema({
  userId: { type: String, default: null },
  username: { type: String, default: null },
  role: { type: String, enum: ['admin', 'staff', 'STORE_OWNER', 'STAFF', 'system'], default: null }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  storeId: { type: String, default: 'legacy-store', index: true, trim: true },
  branchId: { type: String, default: 'legacy-main-branch', index: true, trim: true },
  id: { type: String, required: true },
  requestId: { type: String, required: true, unique: true, index: true },
  fulfillmentType: { type: String, enum: ['DELIVERY', 'DINE_IN'], default: 'DELIVERY', index: true },
  customerName: {
    type: String,
    default: '',
    required: function () { return this.fulfillmentType === 'DELIVERY'; }
  },
  phone: {
    type: String,
    default: '',
    required: function () { return this.fulfillmentType === 'DELIVERY'; }
  },
  address: { type: String, default: '' },
  note: { type: String, default: '' },
  items: { type: Array, required: true },
  subtotalAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalPrice: { type: Number, required: true },
  telegramSent: { type: Boolean, default: false },
  notificationStatus: {
    type: String,
    enum: ['PENDING', 'SENT', 'FAILED'],
    default: 'PENDING'
  },
  telegramMessageId: { type: Number, default: null },
  notificationAttempts: { type: Number, default: 0 },
  notificationError: { type: String, default: null },
  orderStatus: { type: String, enum: ['CONFIRMED', 'CANCELLED'], default: 'CONFIRMED', index: true },
  isPaid: { type: Boolean, default: false, index: true },
  paymentMethod: { type: String, enum: ['CASH', 'BANK_QR', 'MOMO_QR'], default: 'CASH' },
  paymentProvider: { type: String, default: 'MANUAL' },
  paymentStatus: { type: String, enum: ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'], default: 'UNPAID', index: true },
  paymentReference: { type: String, default: null },
  paymentTransactionId: { type: String, default: null },
  paymentAmount: { type: Number, default: 0 },
  paymentExpiresAt: { type: Date, default: null },
  paymentQrImageUrl: { type: String, default: null },
  paymentLink: { type: String, default: null },
  paymentMock: { type: Boolean, default: false },
  cancelReason: { type: String, default: null },
  cancelledAt: { type: Date, default: null, index: true },
  cancelledBy: { type: paidBySchema, default: null },
  retryOfOrderId: { type: String, default: null, index: true },
  unpaidSlotReleased: { type: Boolean, default: false },
  orderActionTokenHash: { type: String, default: null },
  paidAt: { type: Date, default: null, index: true },
  paidBy: { type: paidBySchema, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

orderSchema.index({ storeId: 1, branchId: 1, id: 1 }, { unique: true });
orderSchema.index({ storeId: 1, branchId: 1, isPaid: 1, paidAt: 1 });

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 }
}, { versionKey: false });

const settingsSchema = new mongoose.Schema({
  storeId: { type: String, default: 'legacy-store', index: true, trim: true },
  branchId: { type: String, default: null, index: true, trim: true },
  key: { type: String, required: true, unique: true, default: 'global_settings' },
  telegramBotToken: { type: String, default: '' },
  telegramChatId: { type: String, default: '' },
  shopName: { type: String, default: 'Food Order Shop' },
  timezone: { type: String, default: 'Asia/Bangkok' },
  updatedAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  storeId: { type: String, default: 'legacy-store', index: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phoneNormalized: { type: String, default: null, sparse: true, index: true },
  phoneDisplay: { type: String, default: null },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'staff', 'STORE_OWNER', 'STAFF'] },
  branchIds: [{ type: String }],
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'admin' }, name: 'single_admin_account' }
);

module.exports = {
  StoreModel: mongoose.model('Store', storeSchema),
  BranchModel: mongoose.model('Branch', branchSchema),
  BranchInventoryModel: mongoose.model('BranchInventory', branchInventorySchema),
  AuditLogModel: mongoose.model('AuditLog', auditLogSchema),
  CategoryModel: mongoose.model('Category', categorySchema),
  MenuItemModel: mongoose.model('MenuItem', menuItemSchema),
  OrderModel: mongoose.model('Order', orderSchema),
  CounterModel: mongoose.model('Counter', counterSchema),
  SettingsModel: mongoose.model('Settings', settingsSchema),
  UserModel: mongoose.model('User', userSchema)
};
