const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { connectDB } = require('./db');

const menuRoutes = require('./routes/menu-routes');
const orderRoutes = require('./routes/order-routes');
const settingsRoutes = require('./routes/settings-routes');
const healthRoutes = require('./routes/health-routes');

const app = express();

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
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderLimiter, orderRoutes);
app.use('/api/settings', settingsRoutes);

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server with DB Initialization
async function startServer() {
  await connectDB();

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
}

startServer();
