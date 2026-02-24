require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// --- Startup validation ---
const WEAK_JWT_SECRET = 'your-secret-key-change-this-in-production';

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Cannot start without a database connection string.');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === WEAK_JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set or is using the insecure default value. Set a strong secret before starting the server.');
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const vendorsRoutes = require('./routes/vendors');
const itemsRoutes = require('./routes/items');
const transactionsRoutes = require('./routes/transactions');
const dashboardRoutes = require('./routes/dashboard');
const cycleCountsRoutes = require('./routes/cycleCounts');
const bomsRoutes = require('./routes/boms');
const productionRoutes = require('./routes/production');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's reverse proxy so rate limiting uses the real client IP
app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || /^http:\/\/localhost:\d+$/,
  credentials: false,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Login rate limiting — short window so it resets quickly between automated test runs
const loginLimiter = rateLimit({
  windowMs: 15 * 1000, // 15 seconds
  max: process.env.LOGIN_RATE_LIMIT ? parseInt(process.env.LOGIN_RATE_LIMIT) : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a moment.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

app.use('/api', apiLimiter);

// Health check (includes database connectivity for Railway health checks)
const prisma = require('./lib/prisma');
app.get('/api/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'unreachable';
  }
  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Routes — rate limit only the login endpoint, not all auth routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/cycle-counts', cycleCountsRoutes);
app.use('/api/boms', bomsRoutes);
app.use('/api/production', productionRoutes);

// --- Serve frontend static files (built React SPA) ---
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler (Express 5 forwards async errors automatically)
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
