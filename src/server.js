const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { connectDB } = require('./db');

const menuRoutes = require('./routes/menu-routes');
const categoryRoutes = require('./routes/category-routes');
const orderRoutes = require('./routes/order-routes');
const paymentRoutes = require('./routes/payment-routes');
const settingsRoutes = require('./routes/settings-routes');
const healthRoutes = require('./routes/health-routes');
const authRoutes = require('./routes/auth-routes');
const adminRoutes = require('./routes/admin-routes');
const reportRoutes = require('./routes/report-routes');
const telegramRoutes = require('./routes/telegram-routes');
const superAdminRoutes = require('./routes/super-admin-routes');

const authService = require('./services/auth-service');
const { executeMigration } = require('./services/tenant-migration-service');
const { startOrderExpiryJob } = require('./services/order-expiry-service');
const { startReportScheduler } = require('./services/report-scheduler');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { extractTenantContext } = require('./middleware/tenant-context');

const app = express();

// Trust reverse proxy (e.g. Render, Heroku, Cloudflare) for accurate IP identification in express-rate-limit
app.set('trust proxy', 1);

// Security Body Limits (16-32KB max)
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

// Tenant Context Middleware
app.use(extractTenantContext);

// Rate Limiting (chống spam đơn hàng)
const orderLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Max 10 requests per IP per minute
  message: { message: 'Bạn đang đặt hàng quá nhanh. Vui lòng thử lại sau 1 phút.' }
});

// Serve Static Frontend files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/health', healthRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);

app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/api/reports', requireAuth, requireAdmin, reportRoutes);
app.use('/api/categories', (req, res, next) => {
  if (req.method === 'GET') return next();
  return requireAuth(req, res, next);
}, categoryRoutes);
app.use('/api/menu', (req, res, next) => {
  if (req.method === 'GET') return next();
  return requireAuth(req, res, next);
}, menuRoutes);
app.use('/api/orders', orderLimiter, orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/settings', requireAuth, requireAdmin, settingsRoutes);

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server with DB Initialization & Multi-Tenant Migration
async function startServer() {
  await connectDB();
  await authService.bootstrapAdmin();
  await executeMigration(); // Tự động backfill dữ liệu legacy sang multi-tenant

  startOrderExpiryJob();
  startReportScheduler();

  const server = app.listen(config.PORT, () => {
    console.log(`================================================`);
    console.log(`🚀 Food Order Bridge Multi-Tenant Server Active!`);
    console.log(`🛒 Storefront:          http://localhost:${config.PORT}`);
    console.log(`🔑 Merchant Login:       http://localhost:${config.PORT}/login.html`);
    console.log(`⚙️ Merchant Admin POS:   http://localhost:${config.PORT}/admin.html`);
    console.log(`🛡️ Super Admin Console:  http://localhost:${config.PORT}/super-admin/index.html`);
    console.log(`================================================`);
  });

  // Graceful shutdown handling
  const gracefulShutdown = (signal) => {
    console.log(`🛑 Received ${signal}. Shutting down HTTP server gracefully...`);
    server.close(() => {
      console.log('👋 HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
