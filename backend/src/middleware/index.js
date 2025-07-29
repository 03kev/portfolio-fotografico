const rateLimit = require('express-rate-limit');

// Rate limiting per upload
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 5, // massimo 5 upload per finestra
  message: {
    error: 'Troppi upload. Riprova tra 15 minuti.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting generale per API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 100, // massimo 100 richieste per finestra
  message: {
    error: 'Troppe richieste. Riprova più tardi.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware per logging delle richieste
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${method} ${url} - ${ip}`);
  
  // Log del tempo di risposta
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    console.log(`[${timestamp}] ${method} ${url} - ${status} - ${duration}ms`);
  });
  
  next();
};

// Middleware per gestione errori
const errorHandler = (error, req, res, next) => {
  console.error('Error:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Errori di validazione Multer
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File troppo grande. Massimo 50MB consentiti.',
      error: 'FILE_TOO_LARGE'
    });
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Troppi file. Massimo 1 file per volta.',
      error: 'TOO_MANY_FILES'
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Campo file non valido.',
      error: 'INVALID_FILE_FIELD'
    });
  }

  // Errori di validazione
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Dati non validi.',
      errors: Object.values(error.errors).map(err => err.message),
      error: 'VALIDATION_ERROR'
    });
  }

  // Errori di cast (ID non validi)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID non valido.',
      error: 'INVALID_ID'
    });
  }

  // Errori di duplicazione
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} già esistente.`,
      error: 'DUPLICATE_VALUE'
    });
  }

  // Errore generico del server
  const status = error.status || error.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Errore interno del server' 
    : error.message || 'Errore interno del server';

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      error: error.name 
    })
  });
};

// Middleware per validazione tipi di file
const validateFileType = (allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nessun file caricato.',
        error: 'NO_FILE'
      });
    }

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Tipo di file non supportato. Tipi consentiti: ${allowedTypes.join(', ')}`,
        error: 'INVALID_FILE_TYPE'
      });
    }

    next();
  };
};

// Middleware per validazione dimensioni immagine
const validateImageDimensions = (minWidth = 100, minHeight = 100, maxWidth = 10000, maxHeight = 10000) => {
  return async (req, res, next) => {
    if (!req.file) return next();

    try {
      const sharp = require('sharp');
      const metadata = await sharp(req.file.buffer).metadata();
      
      const { width, height } = metadata;

      if (width < minWidth || height < minHeight) {
        return res.status(400).json({
          success: false,
          message: `Immagine troppo piccola. Dimensioni minime: ${minWidth}x${minHeight}px`,
          error: 'IMAGE_TOO_SMALL'
        });
      }

      if (width > maxWidth || height > maxHeight) {
        return res.status(400).json({
          success: false,
          message: `Immagine troppo grande. Dimensioni massime: ${maxWidth}x${maxHeight}px`,
          error: 'IMAGE_TOO_LARGE'
        });
      }

      // Aggiungi metadati alla richiesta
      req.imageMetadata = metadata;
      next();
    } catch (error) {
      console.error('Errore nell\'analisi dell\'immagine:', error);
      return res.status(400).json({
        success: false,
        message: 'Errore nell\'analisi dell\'immagine.',
        error: 'IMAGE_ANALYSIS_ERROR'
      });
    }
  };
};

// Middleware per sanitizzazione input
const sanitizeInput = (req, res, next) => {
  // Rimuovi caratteri potenzialmente pericolosi
  const sanitize = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  };

  // Sanitizza i campi del body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitize(req.body[key]);
      }
    });
  }

  // Sanitizza i parametri query
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitize(req.query[key]);
      }
    });
  }

  next();
};

// Middleware per CORS personalizzato
const corsHandler = (req, res, next) => {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://tuodominio.com', 'https://www.tuodominio.com']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 ore

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
};

module.exports = {
  uploadLimiter,
  apiLimiter,
  requestLogger,
  errorHandler,
  validateFileType,
  validateImageDimensions,
  sanitizeInput,
  corsHandler
};
