const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pipeline } = require('stream/promises');
const { readMetadataFile } = require('./services/metadataStorage');

const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');
const seriesRoutes = require('./routes/series');
const { env, validateEnv } = require('./config/env');
const DEFAULTS = require('./config/defaults');
const {
    PUBLIC_UPLOADS_PREFIX,
    SOCIAL_ROUTE_PREFIX,
    THUMBNAILS_ROUTE_PREFIX
} = require('./config/assetPaths');
const {
    ensureR2Configured,
    getUploadObject
} = require('./services/r2Storage');
const { buildPhotoAssetPaths } = require('./services/photoDerivatives');
const { toRuntimePhoto } = require('./services/photoRecord');

const app = express();
validateEnv();
ensureR2Configured();
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

    // Allowlist esplicita (+ dominio Vercel se presente).
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
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    try {
        const object = await getUploadObject(`${PUBLIC_UPLOADS_PREFIX}${req.path}`);
        if (!object) {
            return next();
        }

        if (req.path.startsWith(THUMBNAILS_ROUTE_PREFIX) || req.path.startsWith(SOCIAL_ROUTE_PREFIX)) {
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
        if (req.path.startsWith(THUMBNAILS_ROUTE_PREFIX) || req.path.startsWith(SOCIAL_ROUTE_PREFIX)) {
            res.setHeader('X-Robots-Tag', 'noimageindex, noindex');
        }
        next();
    },
    serveUploadsFromR2
];

// Servire file statici (immagini) con header CORP
app.use(PUBLIC_UPLOADS_PREFIX, ...uploadsMiddlewares);

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
    return String(env.siteUrl).trim().replace(/\/+$/, '');
}

function buildPublicAssetUrl(uploadPath) {
    const value = String(uploadPath || '').trim();
    if (!value) return value;
    if (/^https?:\/\//i.test(value)) return value;

    const publicBaseUrl = env.r2PublicUrl;
    if (!publicBaseUrl) return value;
    if (!value.startsWith(`${PUBLIC_UPLOADS_PREFIX}/`)) return value;

    const publicPrefix = PUBLIC_UPLOADS_PREFIX.replace(/^\/+/, '');
    const objectKey = value
        .replace(/^\/+/, '')
        .replace(new RegExp(`^${publicPrefix}/+`), '');
    return `${publicBaseUrl}/${objectKey}`;
}

function buildPhotoCaption(photo) {
    const customDescription = String(photo?.description || '').trim();
    if (customDescription) return customDescription;

    const title = String(photo?.title || 'Foto').trim() || 'Foto';
    const location = String(photo?.location || '').trim();

    if (location) {
        return `Foto "${title}" scattata in ${location}.`;
    }

    return `Foto "${title}" del portfolio di Kevin Muka.`;
}

function toAbsoluteSiteUrl(value, siteBaseUrl) {
    const src = String(value || '').trim();
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    if (src.startsWith('/')) return `${siteBaseUrl}${src}`;
    return `${siteBaseUrl}/${src}`;
}

function resolvePhotoImageUrl(photo, siteBaseUrl) {
    const photoId = String(photo?.id || '').trim();
    if (!photoId) return '';
    const raw = buildPhotoAssetPaths(photoId).socialImagePath;
    if (!raw) return '';

    const normalized = buildPublicAssetUrl(raw);
    return toAbsoluteSiteUrl(normalized, siteBaseUrl);
}

function renderPhotoSeoHtml({ title, description, canonicalUrl, imageUrl, noindex = false }) {
    const safeTitle = escapeXml(title || 'Foto - Kevin Muka');
    const safeDescription = escapeXml(description || 'Dettaglio foto del portfolio di Kevin Muka.');
    const safeCanonical = escapeXml(canonicalUrl || '');
    const safeImage = escapeXml(imageUrl || '');
    const robotsContent = noindex ? 'noindex, nofollow' : 'index, follow';
    const twitterCard = imageUrl ? 'summary_large_image' : 'summary';
    const ogImageBlock = imageUrl
        ? [
            `<meta property="og:image" content="${safeImage}" />`,
            `<meta name="twitter:image" content="${safeImage}" />`
        ].join('\n')
        : '';

    return [
        '<!doctype html>',
        '<html lang="it">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        `  <title>${safeTitle}</title>`,
        `  <meta name="description" content="${safeDescription}" />`,
        `  <meta name="robots" content="${robotsContent}" />`,
        `  <link rel="canonical" href="${safeCanonical}" />`,
        '  <meta property="og:type" content="article" />',
        `  <meta property="og:title" content="${safeTitle}" />`,
        `  <meta property="og:description" content="${safeDescription}" />`,
        `  <meta property="og:url" content="${safeCanonical}" />`,
        '  <meta property="og:site_name" content="Kevin Muka" />',
        `  <meta name="twitter:card" content="${twitterCard}" />`,
        `  <meta name="twitter:title" content="${safeTitle}" />`,
        `  <meta name="twitter:description" content="${safeDescription}" />`,
        `  ${ogImageBlock}`,
        '</head>',
        '<body>',
        `  <h1>${safeTitle}</h1>`,
        `  <p>${safeDescription}</p>`,
        '</body>',
        '</html>'
    ].join('\n');
}

async function handlePhotoSeoPage(req, res, next) {
    try {
        const siteBaseUrl = getSiteBaseUrl();
        const rawId = String(req.params.id || '').trim();
        const decodedPhotoId = decodeURIComponent(rawId);
        const canonicalUrl = `${siteBaseUrl}/photo/${encodeURIComponent(decodedPhotoId)}`;
        const rawPhotos = await readMetadataFile('photos.json', []);
        const photos = Array.isArray(rawPhotos) ? rawPhotos.map((item) => toRuntimePhoto(item)) : [];
        const photo = photos.find((item) => String(item?.id || '').trim() === decodedPhotoId);

        if (!photo) {
            const notFoundHtml = renderPhotoSeoHtml({
                title: 'Foto non trovata - Kevin Muka',
                description: 'La foto richiesta non è disponibile.',
                canonicalUrl,
                imageUrl: '',
                noindex: true
            });

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=60');
            return res.status(404).send(notFoundHtml);
        }

        const photoTitle = String(photo.title || 'Foto').trim() || 'Foto';
        const title = `${photoTitle} - Kevin Muka`;
        const description = buildPhotoCaption(photo);
        const imageUrl = resolvePhotoImageUrl(photo, siteBaseUrl);
        const html = renderPhotoSeoHtml({
            title,
            description,
            canonicalUrl,
            imageUrl
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        return res.status(200).send(html);
    } catch (error) {
        return next(error);
    }
}

async function handleSitemapPages(req, res) {
    try {
        const siteBaseUrl = getSiteBaseUrl();
        const pages = ['/', '/series', '/gallery', '/map', '/about', '/contact'];
        const entries = pages
            .map((path) => {
                const pageUrl = `${siteBaseUrl}${path === '/' ? '/' : path}`;
                return [
                    '<url>',
                    `<loc>${escapeXml(pageUrl)}</loc>`,
                    '<changefreq>weekly</changefreq>',
                    path === '/' ? '<priority>1.0</priority>' : '<priority>0.8</priority>',
                    '</url>'
                ].join('');
            })
            .join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>`
            + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
            + `${entries}`
            + `</urlset>`;

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.status(200).send(xml);
    } catch (error) {
        console.error('Errore generazione sitemap pagine:', error);
        res.status(500).send('Errore generazione sitemap pagine');
    }
}

function handleRobotsTxt(req, res) {
    try {
        const siteBaseUrl = getSiteBaseUrl();
        const body = [
            'User-agent: *',
            'Allow: /',
            '',
            `Sitemap: ${siteBaseUrl}/sitemap.xml`,
            `Sitemap: ${siteBaseUrl}/sitemap-images.xml`
        ].join('\n');

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.status(200).send(body);
    } catch (error) {
        console.error('Errore generazione robots.txt:', error);
        res.status(500).send('Errore generazione robots.txt');
    }
}

async function handleSitemapImages(req, res) {
    try {
        const rawPhotos = await readMetadataFile('photos.json', []);
        const photos = Array.isArray(rawPhotos) ? rawPhotos.map((item) => toRuntimePhoto(item)) : [];
        const siteBaseUrl = getSiteBaseUrl();

        const imageEntries = photos
            .map((photo) => {
                const photoId = String(photo.id || '').trim();
                if (!photoId) return '';

                let fullImage = buildPublicAssetUrl(buildPhotoAssetPaths(photoId).imagePath);
                if (!fullImage) return '';
                if (!/^https?:\/\//i.test(fullImage)) {
                    if (fullImage.startsWith('/')) {
                        fullImage = `${siteBaseUrl}${fullImage}`;
                    } else {
                        fullImage = `${siteBaseUrl}/${fullImage}`;
                    }
                }

                const landingUrl = `${siteBaseUrl}/photo/${encodeURIComponent(photoId)}`;

                const title = escapeXml(photo.title || 'Foto');
                const caption = escapeXml(buildPhotoCaption(photo));

                return [
                    '<url>',
                    `<loc>${escapeXml(landingUrl)}</loc>`,
                    '<image:image>',
                    `<image:loc>${escapeXml(fullImage)}</image:loc>`,
                    `<image:title>${title}</image:title>`,
                    `<image:caption>${caption}</image:caption>`,
                    '</image:image>',
                    '</url>'
                ].join('');
            })
            .filter(Boolean)
            .join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>`
            + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" `
            + `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`
            + `${imageEntries}`
            + `</urlset>`;

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.status(200).send(xml);
    } catch (error) {
        console.error('Errore generazione sitemap immagini:', error);
        res.status(500).send('Errore generazione sitemap immagini');
    }
}

// SEO endpoints pubblici (root).
app.get('/sitemap.xml', handleSitemapPages);
app.get('/robots.txt', handleRobotsTxt);
app.get('/sitemap-images.xml', handleSitemapImages);
app.get('/photo/:id', handlePhotoSeoPage);

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
