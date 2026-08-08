const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { connectDB } = require('./db');

const menuRoutes = require('./routes/menu-routes');
const categoryRoutes = require('./routes/category-routes');
const orderRoutes = require('./routes/order-routes');
const settingsRoutes = require('./routes/settings-routes');
const healthRoutes = require('./routes/health-routes');
const authRoutes = require('./routes/auth-routes');
const adminRoutes = require('./routes/admin-routes');
const reportRoutes = require('./routes/report-routes');
const authService = require('./services/auth-service');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();

// Trust reverse proxy (e.g. Render, Heroku, Cloudflare) for accurate IP identification in express-rate-limit
app.set('trust proxy', 1);

// Security Body Limits (16-32KB max)
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

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
app.use('/api/auth', authRoutes);
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
app.use('/api/settings', requireAuth, requireAdmin, settingsRoutes);

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server with DB Initialization
async function startServer() {
  await connectDB();
  await authService.bootstrapAdmin();

  const server = app.listen(config.PORT, () => {
    console.log(`================================================`);
    console.log(`🚀 Food Order Bridge Server is running on port ${config.PORT}`);
    console.log(`🌐 Storefront: http://localhost:${config.PORT}`);
    console.log(`⚙️ Admin Page: http://localhost:${config.PORT}/admin.html`);
    console.log(`================================================`);
  });

  // Graceful shutdown handling for Render
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
