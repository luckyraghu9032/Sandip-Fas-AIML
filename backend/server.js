const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('./config/env');
const { ensureAppSchema } = require('./utils/schema');

const app = express();
const PORT = process.env.PORT || 5001;

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',        // VS Code Live Server
  'http://127.0.0.1:5500',
  'https://sandip-fas-aiml-frontend.vercel.app',  // Vercel frontend static site
  'capacitor://localhost',        // Capacitor Android app
  'http://localhost',             // Capacitor fallback origin
  'https://localhost',            // Capacitor Android (androidScheme: https)
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true
};

// Security: HTTP headers
app.use(helmet());

// Rate limiter: max 10 login attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

// Rate limiter: max 10 OTP attempts per IP per 15 minutes
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again after 15 minutes.' },
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// Routes
const authRoutes = require('./routes/auth');
const hodRoutes = require('./routes/hod');
const coordinatorRoutes = require('./routes/coordinator');
const studentRoutes = require('./routes/student');
const notificationRoutes = require('./routes/notifications');

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/login/verify-email-otp', otpLimiter);
app.use('/api/mfa/verify-email-otp', otpLimiter);
app.use('/api/mfa/verify-setup', otpLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/hod', hodRoutes);
app.use('/api/coordinator', coordinatorRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Root route for base URL
app.get('/', (req, res) => {
  res.send('OK');
});

// NOTE: static files are served by Render Static Site (sandip-fas-frontend)

app.use((err, req, res, next) => {
  const isJsonParseError = err instanceof SyntaxError && err.type === 'entity.parse.failed';
  const statusCode = isJsonParseError ? 400 : (err.status || err.statusCode || 500);

  // Only log full stack in development to avoid leaking internals
  if (process.env.NODE_ENV !== 'production') {
    console.error(`${req.method} ${req.originalUrl} failed:`, err.stack || err);
  } else {
    console.error(`${req.method} ${req.originalUrl} failed: ${err.message}`);
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(statusCode).json({
    error: isJsonParseError
      ? 'Request body must be valid JSON.'
      : (statusCode === 500 ? 'Internal server error' : (err.message || 'Request failed.')),
  });
});


async function startServer() {
  try {
    await ensureAppSchema();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    }).on('error', (err) => {
      console.error('Server failed to start:', err.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to prepare database schema:', error.message);
    process.exit(1);
  }
}

// Start server if run directly (local development)
if (require.main === module) {
  startServer();
}

// Export for serverless environments like Vercel
module.exports = app;
