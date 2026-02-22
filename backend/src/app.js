const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pipeline } = require('stream/promises');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');
const seriesRoutes = require('./routes/series');
const { UPLOADS_DIR } = require('./config/storage');
const { parsePositiveInt } = require('./utils/env');
const {
    canUseLocalFallback,
    ensureR2ConfiguredInProduction,
    getUploadObject,
    isR2Enabled
} = require('./services/r2Storage');

const app = express();
ensureR2ConfiguredInProduction();

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
const rateLimitWindowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
const rateLimitMaxRequests = parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 500);

const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMaxRequests
});
app.use(limiter);

function normalizeOriginValue(value) {
    return String(value || '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\/+$/, '');
}

function getOriginHost(origin) {
    try {
        return new URL(origin).host;
    } catch {
        return null;
    }
}

const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => normalizeOriginValue(origin))
    .filter(Boolean);

if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
    console.warn('CORS_ORIGINS non configurata: verranno accettate solo origin consentite automaticamente (es. VERCEL_URL).');
}

// CORS
const corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (process.env.NODE_ENV !== 'production') {
            const devOrigins = ['http://localhost:3000', 'http://localhost:3001'];
            return callback(null, devOrigins.includes(origin));
        }

        // In produzione, se non e` stata configurata una allowlist esplicita,
        // consenti l'origin chiamante per evitare blocchi su domini Vercel/custom.
        if (configuredOrigins.length === 0) {
            return callback(null, true);
        }

        const normalizedOrigin = normalizeOriginValue(origin);
        const originHost = getOriginHost(normalizedOrigin);
        const vercelOrigin = process.env.VERCEL_URL
            ? normalizeOriginValue(`https://${process.env.VERCEL_URL}`)
            : null;

        if (vercelOrigin && normalizedOrigin === vercelOrigin) {
            return callback(null, true);
        }

        if (configuredOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
        }

        if (originHost) {
            const hostAllowed = configuredOrigins.some((allowedOrigin) => getOriginHost(allowedOrigin) === originHost);
            if (hostAllowed) {
                return callback(null, true);
            }
        }

        if (vercelOrigin && originHost && getOriginHost(vercelOrigin) === originHost) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-requested-with']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

async function serveUploadsFromR2(req, res, next) {
    if (!isR2Enabled()) {
        return next();
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    try {
        const object = await getUploadObject(`/uploads${req.path}`);
        if (!object) {
            return next();
        }

        if (object.contentType) res.setHeader('Content-Type', object.contentType);
        if (object.cacheControl) res.setHeader('Cache-Control', object.cacheControl);
        if (object.contentLength != null) res.setHeader('Content-Length', String(object.contentLength));
        if (object.etag) res.setHeader('ETag', object.etag);
        if (object.lastModified) res.setHeader('Last-Modified', new Date(object.lastModified).toUTCString());

        if (req.method === 'HEAD') {
            return res.status(200).end();
        }

        if (!object.stream) {
            return res.status(500).json({ message: 'Stream file non disponibile' });
        }

        await pipeline(object.stream, res);
    } catch (error) {
        next(error);
    }
}

const uploadsMiddlewares = [
    (req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    },
    serveUploadsFromR2
];

if (canUseLocalFallback()) {
    uploadsMiddlewares.push(express.static(UPLOADS_DIR));
}

// Servire file statici (immagini) con header CORP
app.use('/uploads', ...uploadsMiddlewares);

// Routes
app.use('/api/auth', authRoutes);
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

    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File troppo grande', code: error.code });
    }

    if (error.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ message: error.message || 'Tipo file non consentito', code: error.code });
    }

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
