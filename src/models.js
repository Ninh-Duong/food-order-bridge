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
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  isBestseller: { type: Boolean, default: false },
  isSpicy: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  requestId: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  note: { type: String, default: '' },
  items: { type: Array, required: true },
  totalPrice: { type: Number, required: true },
  telegramSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

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

// The service also checks this rule so it is enforced in file fallback mode.
userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'admin' }, name: 'single_admin_account' }
);

module.exports = {
  CategoryModel: mongoose.model('Category', categorySchema),
  MenuItemModel: mongoose.model('MenuItem', menuItemSchema),
  OrderModel: mongoose.model('Order', orderSchema),
  SettingsModel: mongoose.model('Settings', settingsSchema),
  UserModel: mongoose.model('User', userSchema)
};
