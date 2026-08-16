const path = require('path');
const fs = require('fs');

console.log('================================================');
console.log('🔍 Running Pre-Deploy Healthcheck Service...');
console.log('================================================');

let hasError = false;

// 1. Verify Node.js Environment & Port configuration
const PORT = process.env.PORT || 3000;
console.log(`[OK] Port configuration: ${PORT}`);

// 2. Check essential project files existence (using dynamic relative paths)
const rootDir = path.join(__dirname, '..');
const requiredFiles = [
  path.join(__dirname, 'server.js'),
  path.join(__dirname, 'config.js'),
  path.join(__dirname, 'db.js'),
  path.join(__dirname, 'models.js'),
  path.join(__dirname, 'middleware', 'tenant-context.js'),
  path.join(__dirname, 'services', 'super-admin-service.js'),
  path.join(__dirname, 'services', 'tenant-migration-service.js'),
  path.join(__dirname, 'utils', 'phone-normalizer.js'),
  path.join(__dirname, '..', 'public', 'index.html'),
  path.join(__dirname, '..', 'public', 'login.html'),
  path.join(__dirname, '..', 'public', 'admin.html'),
  path.join(__dirname, '..', 'public', 'super-admin', 'index.html')
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`[FAIL] Missing essential file: ${file}`);
    hasError = true;
  } else {
    console.log(`[OK] Verified file: ${path.relative(rootDir, file)}`);
  }
}

// 3. Test Loading Config & Key Services
try {
  const config = require('./config');
  console.log(`[OK] Config loaded successfully (Shop: "${config.SHOP_NAME}", Timezone: "${config.ORDER_TIMEZONE}")`);
} catch (err) {
  console.error('[FAIL] Error loading config.js:', err.message);
  hasError = true;
}

// 4. Test MongoDB URI format if provided
if (process.env.MONGODB_URI) {
  if (!process.env.MONGODB_URI.startsWith('mongodb://') && !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
    console.error('[FAIL] MONGODB_URI is set but invalid format (must start with mongodb:// or mongodb+srv://)');
    hasError = true;
  } else {
    console.log('[OK] MONGODB_URI format valid');
  }
} else {
  console.log('[OK] MONGODB_URI not set - System will run in automatic JSON fallback mode');
}

// 5. Test Environment Safety Requirements
if (process.env.NODE_ENV === 'production') {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    console.warn('[WARN] AUTH_SECRET is not configured or < 32 chars. Running with default fallback.');
  }
  if (!process.env.SUPER_ADMIN_PHONE || !process.env.SUPER_ADMIN_PASSWORD_HASH || !process.env.SUPER_ADMIN_AUTH_SECRET) {
    console.warn('[WARN] Super Admin credentials not configured in env. Running with default fallback.');
  }
}

// 6. Test Express Router Loading & Instantiation
try {
  require('./routes/menu-routes');
  require('./routes/order-routes');
  require('./routes/auth-routes');
  require('./routes/category-routes');
  require('./routes/settings-routes');
  require('./routes/report-routes');
  require('./routes/telegram-routes');
  require('./routes/super-admin-routes');
  console.log('[OK] Express API Routes loaded without syntax or module errors');
} catch (err) {
  console.error('[FAIL] Express route loading error:', err.message);
  hasError = true;
}

console.log('================================================');
if (hasError) {
  console.error('❌ Pre-Deploy Healthcheck FAILED! Deployment aborted.');
  process.exit(1);
} else {
  console.log('✅ Pre-Deploy Healthcheck PASSED! System is healthy for deployment.');
  process.exit(0);
}
