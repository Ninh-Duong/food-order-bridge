const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const {
  StoreModel,
  BranchModel,
  BranchInventoryModel,
  CategoryModel,
  MenuItemModel,
  OrderModel,
  UserModel,
  SettingsModel
} = require('../models');

const LEGACY_STORE_ID = 'legacy-store';
const LEGACY_BRANCH_ID = 'legacy-main-branch';

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function readJsonFile(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw && raw.trim()) return JSON.parse(raw);
    }
  } catch (_) {}
  return defaultVal;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * Thống kê các bản ghi chưa được phân vùng tenant (Legacy data)
 */
async function dryRunMigration() {
  if (isDBConnected()) {
    const unmigratedCategories = await CategoryModel.countDocuments({
      $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }]
    });

    const unmigratedMenuItems = await MenuItemModel.countDocuments({
      $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }]
    });

    const unmigratedOrders = await OrderModel.countDocuments({
      $or: [
        { storeId: { $exists: false } }, { storeId: '' }, { storeId: null },
        { branchId: { $exists: false } }, { branchId: '' }, { branchId: null }
      ]
    });

    const unmigratedUsers = await UserModel.countDocuments({
      $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }]
    });

    const unmigratedSettings = await SettingsModel.countDocuments({
      $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }]
    });

    return {
      mode: 'MONGODB',
      targetStoreId: LEGACY_STORE_ID,
      targetBranchId: LEGACY_BRANCH_ID,
      unmigratedCounts: {
        categories: unmigratedCategories,
        menuItems: unmigratedMenuItems,
        orders: unmigratedOrders,
        users: unmigratedUsers,
        settings: unmigratedSettings
      },
      totalUnmigrated: unmigratedCategories + unmigratedMenuItems + unmigratedOrders + unmigratedUsers + unmigratedSettings
    };
  }

  // File fallback mode
  const categories = readJsonFile(CATEGORIES_FILE);
  const menuItems = readJsonFile(MENU_FILE);
  const orders = readJsonFile(ORDERS_FILE);
  const settings = readJsonFile(SETTINGS_FILE, {});

  const unmigratedCategories = categories.filter(c => !c.storeId).length;
  const unmigratedMenuItems = menuItems.filter(m => !m.storeId).length;
  const unmigratedOrders = orders.filter(o => !o.storeId || !o.branchId).length;
  const unmigratedSettings = settings.storeId ? 0 : 1;

  return {
    mode: 'FILE_FALLBACK',
    targetStoreId: LEGACY_STORE_ID,
    targetBranchId: LEGACY_BRANCH_ID,
    unmigratedCounts: {
      categories: unmigratedCategories,
      menuItems: unmigratedMenuItems,
      orders: unmigratedOrders,
      users: 0,
      settings: unmigratedSettings
    },
    totalUnmigrated: unmigratedCategories + unmigratedMenuItems + unmigratedOrders + unmigratedSettings
  };
}

/**
 * Thực thi chuyển đổi toàn bộ dữ liệu legacy sang legacy-store & legacy-main-branch
 */
async function executeMigration() {
  const report = {
    mode: isDBConnected() ? 'MONGODB' : 'FILE_FALLBACK',
    storeCreated: false,
    branchCreated: false,
    categoriesUpdated: 0,
    menuItemsUpdated: 0,
    branchInventoriesCreated: 0,
    ordersUpdated: 0,
    usersUpdated: 0,
    settingsUpdated: 0,
    errors: []
  };

  try {
    if (isDBConnected()) {
      // 1. Đảm bảo Legacy Store tồn tại
      let legacyStore = await StoreModel.findOne({ id: LEGACY_STORE_ID });
      if (!legacyStore) {
        legacyStore = await StoreModel.create({
          id: LEGACY_STORE_ID,
          code: 'LEGACY_STORE',
          name: 'Cửa hàng Mặc định',
          slug: 'cua-hang-mac-dinh',
          phone: '0900000000',
          status: 'ACTIVE',
          plan: 'PRO',
          maxBranches: 5
        });
        report.storeCreated = true;
      }

      // 2. Đảm bảo Legacy Branch tồn tại
      let legacyBranch = await BranchModel.findOne({ id: LEGACY_BRANCH_ID });
      if (!legacyBranch) {
        legacyBranch = await BranchModel.create({
          id: LEGACY_BRANCH_ID,
          storeId: LEGACY_STORE_ID,
          code: 'MAIN',
          name: 'Chi nhánh Chính',
          slug: 'chi-nhanh-chinh',
          timezone: 'Asia/Ho_Chi_Minh',
          status: 'ACTIVE'
        });
        report.branchCreated = true;
      }

      // 3. Backfill Category
      const categoryRes = await CategoryModel.updateMany(
        { $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }] },
        { $set: { storeId: LEGACY_STORE_ID } }
      );
      report.categoriesUpdated = categoryRes.modifiedCount || categoryRes.nModified || 0;

      // 4. Backfill MenuItem & Khởi tạo BranchInventory
      const menuItems = await MenuItemModel.find({
        $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }]
      });

      for (const item of menuItems) {
        item.storeId = LEGACY_STORE_ID;
        await item.save();
        report.menuItemsUpdated++;

        const existingInventory = await BranchInventoryModel.findOne({
          storeId: LEGACY_STORE_ID,
          branchId: LEGACY_BRANCH_ID,
          menuItemId: item.id
        });

        if (!existingInventory) {
          await BranchInventoryModel.create({
            storeId: LEGACY_STORE_ID,
            branchId: LEGACY_BRANCH_ID,
            menuItemId: item.id,
            stockQuantity: item.stockQuantity || 0,
            active: item.active !== false
          });
          report.branchInventoriesCreated++;
        }
      }

      // 5. Backfill Order
      const orderRes = await OrderModel.updateMany(
        {
          $or: [
            { storeId: { $exists: false } }, { storeId: '' }, { storeId: null },
            { branchId: { $exists: false } }, { branchId: '' }, { branchId: null }
          ]
        },
        {
          $set: {
            storeId: LEGACY_STORE_ID,
            branchId: LEGACY_BRANCH_ID
          }
        }
      );
      report.ordersUpdated = orderRes.modifiedCount || orderRes.nModified || 0;

      // 6. Backfill User
      const users = await UserModel.find({
        $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }]
      });

      let firstAdminId = null;
      for (const user of users) {
        user.storeId = LEGACY_STORE_ID;
        user.branchIds = [LEGACY_BRANCH_ID];

        if (user.role === 'admin') {
          user.role = 'STORE_OWNER';
          if (!firstAdminId) firstAdminId = String(user._id || user.id);
        } else if (user.role === 'staff') {
          user.role = 'STAFF';
        }

        await user.save();
        report.usersUpdated++;
      }

      if (firstAdminId && !legacyStore.primaryOwnerId) {
        legacyStore.primaryOwnerId = firstAdminId;
        await legacyStore.save();
      }

      // 7. Backfill Settings
      const settingsRes = await SettingsModel.updateMany(
        { $or: [{ storeId: { $exists: false } }, { storeId: '' }, { storeId: null }] },
        {
          $set: {
            storeId: LEGACY_STORE_ID,
            branchId: LEGACY_BRANCH_ID
          }
        }
      );
      report.settingsUpdated = settingsRes.modifiedCount || settingsRes.nModified || 0;

    } else {
      // File Fallback Migration Mode
      const categories = readJsonFile(CATEGORIES_FILE);
      let categoriesUpdated = 0;
      categories.forEach(c => {
        if (!c.storeId) {
          c.storeId = LEGACY_STORE_ID;
          categoriesUpdated++;
        }
      });
      if (categoriesUpdated > 0) writeJsonFile(CATEGORIES_FILE, categories);
      report.categoriesUpdated = categoriesUpdated;

      const menuItems = readJsonFile(MENU_FILE);
      let menuItemsUpdated = 0;
      menuItems.forEach(m => {
        if (!m.storeId) {
          m.storeId = LEGACY_STORE_ID;
          menuItemsUpdated++;
        }
      });
      if (menuItemsUpdated > 0) writeJsonFile(MENU_FILE, menuItems);
      report.menuItemsUpdated = menuItemsUpdated;

      const orders = readJsonFile(ORDERS_FILE);
      let ordersUpdated = 0;
      orders.forEach(o => {
        if (!o.storeId || !o.branchId) {
          o.storeId = LEGACY_STORE_ID;
          o.branchId = LEGACY_BRANCH_ID;
          ordersUpdated++;
        }
      });
      if (ordersUpdated > 0) writeJsonFile(ORDERS_FILE, orders);
      report.ordersUpdated = ordersUpdated;

      const settings = readJsonFile(SETTINGS_FILE, {});
      if (!settings.storeId) {
        settings.storeId = LEGACY_STORE_ID;
        settings.branchId = LEGACY_BRANCH_ID;
        writeJsonFile(SETTINGS_FILE, settings);
        report.settingsUpdated = 1;
      }
    }
  } catch (err) {
    report.errors.push(err.message);
  }

  return report;
}

module.exports = {
  LEGACY_STORE_ID,
  LEGACY_BRANCH_ID,
  dryRunMigration,
  executeMigration
};
