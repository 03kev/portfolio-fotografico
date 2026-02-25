const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pipeline } = require('stream/promises');
const { readMetadataFile } = require('./services/metadataStorage');

const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');
const seriesRoutes = require('./routes/series');
const { UPLOADS_DIR } = require('./config/storage');
const { env, validateEnv } = require('./config/env');
const DEFAULTS = require('./config/defaults');
const {
    canUseLocalFallback,
    ensureR2ConfiguredInProduction,
    getUploadObject,
    isR2Enabled
} = require('./services/r2Storage');

const app = express();
validateEnv();
ensureR2ConfiguredInProduction();
app.set('trust proxy', 1);

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
const rateLimitWindowMs = DEFAULTS.rateLimitWindowMs;
const rateLimitMaxRequests = DEFAULTS.rateLimitMaxRequests;

const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMaxRequests
});
app.use(limiter);

const writeLimiter = rateLimit({
    windowMs: DEFAULTS.writeRateLimitWindowMs,
    max: DEFAULTS.writeRateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: {
        success: false,
        message: 'Troppi tentativi di modifica. Riprova piu` tardi.'
    }
});

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

const configuredOrigins = env.corsOrigins
    .map((origin) => normalizeOriginValue(origin))
    .filter(Boolean);
const configuredOriginHosts = configuredOrigins
    .map((origin) => getOriginHost(origin))
    .filter(Boolean);
const vercelOrigin = env.vercelUrl
    ? normalizeOriginValue(`https://${env.vercelUrl}`)
    : null;
const vercelOriginHost = vercelOrigin ? getOriginHost(vercelOrigin) : null;

if (env.isProduction && configuredOrigins.length === 0) {
    console.warn('CORS_ORIGINS non configurata: verrà consentito solo VERCEL_URL in produzione.');
}

function isAllowedCrossOrigin(origin) {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = normalizeOriginValue(origin);
    if (!normalizedOrigin) {
        return false;
    }

    if (!env.isProduction) {
        const devOrigins = ['http://localhost:3000', 'http://localhost:3001'];
        return devOrigins.includes(normalizedOrigin);
    }

    // In produzione: allowlist esplicita + dominio Vercel.
    if (configuredOrigins.includes(normalizedOrigin)) {
        return true;
    }

    if (vercelOrigin && normalizedOrigin === vercelOrigin) {
        return true;
    }

    const originHost = getOriginHost(normalizedOrigin);
    if (!originHost) {
        return false;
    }

    if (configuredOriginHosts.includes(originHost)) {
        return true;
    }

    if (vercelOriginHost && originHost === vercelOriginHost) {
        return true;
    }

    return false;
}

// CORS
const corsOptions = {
    origin(origin, callback) {
        return callback(null, isAllowedCrossOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: env.isProduction
        ? ['Content-Type', 'x-requested-with']
        : ['Content-Type', 'Authorization', 'x-api-key', 'x-requested-with']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsing
app.use(express.json({ limit: DEFAULTS.jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: DEFAULTS.urlencodedBodyLimit }));

// Protezione CSRF basata su Origin per tutte le richieste state-changing.
app.use((req, res, next) => {
    if (!env.isProduction) {
        return next();
    }

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const origin = req.headers.origin;
    if (!origin || !isAllowedCrossOrigin(origin)) {
        return res.status(403).json({
            success: false,
            message: 'Origine richiesta non consentita'
        });
    }

    return next();
});

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

        if (req.path.startsWith('/thumbnails/')) {
            res.setHeader('X-Robots-Tag', 'noimageindex, noindex');
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
        if (req.path.startsWith('/thumbnails/')) {
            res.setHeader('X-Robots-Tag', 'noimageindex, noindex');
        }
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
app.use('/api/photos', writeLimiter);
app.use('/api/photos', photoRoutes);
app.use('/api/series', writeLimiter);
app.use('/api/series', seriesRoutes);

function escapeXml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function getSiteBaseUrl() {
    if (env.corsOrigins.length > 0) {
        const firstOrigin = String(env.corsOrigins[0]).trim().replace(/\/+$/, '');
        if (firstOrigin) return firstOrigin;
    }

    if (env.vercelUrl) {
        return `https://${env.vercelUrl}`;
    }

    return 'https://kevinmuka.dev';
}

function buildPublicAssetUrl(uploadPath) {
    const value = String(uploadPath || '').trim();
    if (!value) return value;
    if (/^https?:\/\//i.test(value)) return value;

    const publicBaseUrl = env.r2PublicUrl;
    if (!publicBaseUrl) return value;
    if (!value.startsWith('/uploads/')) return value;

    const objectKey = value.replace(/^\/+/, '').replace(/^uploads\/+/, '');
    return `${publicBaseUrl}/${objectKey}`;
}

app.get('/api/sitemap-images.xml', async (req, res) => {
    try {
        const photos = await readMetadataFile('photos.json', []);
        const siteBaseUrl = getSiteBaseUrl();

        const imageEntries = photos
            .map((photo) => {
                const fullImage = buildPublicAssetUrl(photo.image || '');
                if (!fullImage) return '';
                const landingUrl = `${siteBaseUrl}/gallery?photo=${encodeURIComponent(String(photo.id || ''))}`;
                if (!photo.id) return '';

                const title = escapeXml(photo.title || 'Foto');
                const caption = escapeXml(photo.description || photo.location || photo.title || '');

                return `
                    <url>
                    <loc>${escapeXml(landingUrl)}</loc>
                    <image:image>
                        <image:loc>${escapeXml(fullImage)}</image:loc>
                        <image:title>${title}</image:title>
                        <image:caption>${caption}</image:caption>
                    </image:image>
                    </url>`;
            })
            .filter(Boolean)
            .join('');

        const xml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${imageEntries}
            </urlset>`;

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.status(200).send(xml);
    } catch (error) {
        console.error('Errore generazione sitemap immagini:', error);
        res.status(500).send('Errore generazione sitemap immagini');
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        env: env.nodeEnv
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
        ...(env.isDevelopment && { stack: error.stack })
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ message: 'Endpoint non trovato' });
});

module.exports = app;
