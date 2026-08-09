const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const menuItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, uppercase: true, trim: true },
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

const paidBySchema = new mongoose.Schema({
  userId: { type: String, default: null },
  username: { type: String, default: null },
  role: { type: String, enum: ['admin', 'staff'], default: null }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  requestId: { type: String, required: true, unique: true, index: true },
  fulfillmentType: { type: String, enum: ['DELIVERY', 'DINE_IN'], default: 'DELIVERY', index: true },
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
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
  isPaid: { type: Boolean, default: false, index: true },
  paidAt: { type: Date, default: null, index: true },
  paidBy: { type: paidBySchema, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

orderSchema.index({ isPaid: 1, paidAt: 1 });

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 }
}, { versionKey: false });

const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global_settings' },
  telegramBotToken: { type: String, default: '' },
  telegramChatId: { type: String, default: '' },
  shopName: { type: String, default: 'Food Order Shop' },
  timezone: { type: String, default: 'Asia/Bangkok' },
  updatedAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'staff'] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'admin' }, name: 'single_admin_account' }
);

module.exports = {
  CategoryModel: mongoose.model('Category', categorySchema),
  MenuItemModel: mongoose.model('MenuItem', menuItemSchema),
  OrderModel: mongoose.model('Order', orderSchema),
  CounterModel: mongoose.model('Counter', counterSchema),
  SettingsModel: mongoose.model('Settings', settingsSchema),
  UserModel: mongoose.model('User', userSchema)
};
