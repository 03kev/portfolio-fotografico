const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const photoRoutes = require('./routes/photos');
const seriesRoutes = require('./routes/series');
const { BACKEND_ROOT, UPLOADS_DIR } = require('./config/storage');

const app = express();

// Middleware di sicurezza con configurazione personalizzata
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', '*'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"]
      }
    }
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500
});
app.use(limiter);

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// CORS
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV !== 'production') {
      const devOrigins = ['http://localhost:3000', 'http://localhost:3001'];
      return callback(devOrigins.includes(origin) ? null : new Error('Non consentito da CORS'), devOrigins.includes(origin));
    }

    // In produzione, se non viene configurata la whitelist permetti same-origin/proxy su Vercel.
    if (configuredOrigins.length === 0) {
      return callback(null, true);
    }

    if (configuredOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Non consentito da CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servire file statici (immagini) con header CORP
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  },
  express.static(UPLOADS_DIR),
  express.static(path.join(BACKEND_ROOT, 'uploads'))
);

// Routes
app.use('/api/photos', photoRoutes);
app.use('/api/series', seriesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.status || 500).json({
    message: error.message || 'Errore interno del server',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Endpoint non trovato' });
});

module.exports = app;
