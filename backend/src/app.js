const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pipeline } = require('stream/promises');

const authRoutes = require('./routes/auth');
const auditRoutes = require('./routes/audit');
const mediaCleanupRoutes = require('./routes/mediaCleanup');
const photoRoutes = require('./routes/photos');
const seriesRoutes = require('./routes/series');
const { portfolioRepository } = require('./repositories');
const { env, validateEnv } = require('./config/env');
const DEFAULTS = require('./config/defaults');
const {
    PUBLIC_UPLOADS_PREFIX
} = require('./config/assetPaths');
const {
    ensureR2Configured,
    getUploadObject
} = require('./services/r2Storage');
const { buildPublicAssetUrl } = require('./services/publicAssetUrl');
const {
    shouldNoIndexPublicPhotoAssetPath
} = require('./services/photoAssetSeo');

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
        ? ['Content-Type', 'X-Expected-Version', 'If-Match', 'x-requested-with']
        : ['Content-Type', 'X-Expected-Version', 'If-Match', 'Authorization', 'x-api-key', 'x-requested-with']
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

        if (shouldNoIndexPublicPhotoAssetPath(req.path)) {
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
        if (shouldNoIndexPublicPhotoAssetPath(req.path)) {
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
app.use('/api/audit', auditRoutes);
app.use('/api/internal/media-cleanup', mediaCleanupRoutes);
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

function resolvePhotoImageUrl(photo, siteBaseUrl, role = 'social') {
    const raw = (Array.isArray(photo?.assets) ? photo.assets : [])
        .find((asset) => asset.scope === 'public' && asset.role === role)
        ?.path;
    if (!raw) return '';

    const normalized = buildPublicAssetUrl(raw);
    return toAbsoluteSiteUrl(normalized, siteBaseUrl);
}

function serializeJsonForHtml(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getPhotoLastModifiedIso(photo) {
    const timestamp = Number(photo?.updatedAt || photo?.derivativesVersion || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';

    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getSeriesLastModifiedIso(series) {
    const timestamp = Date.parse(series?.updatedAt || series?.createdAt || '');
    if (!Number.isFinite(timestamp)) return '';

    return new Date(timestamp).toISOString();
}

function buildSeriesDescription(series) {
    const customDescription = String(series?.description || '').trim();
    if (customDescription) return customDescription;

    const title = String(series?.title || 'Serie fotografica').trim() || 'Serie fotografica';
    return `Serie fotografica "${title}" di Kevin Muka.`;
}

function renderSeoHtml({
    title,
    description,
    canonicalUrl,
    imageUrl,
    structuredData = null,
    noindex = false,
    ogType = 'website',
    bodyContent = ''
}) {
    const safeTitle = escapeXml(title || 'Kevin Muka | Portfolio Fotografico');
    const safeDescription = escapeXml(description || 'Portfolio fotografico di Kevin Muka.');
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
    const structuredDataBlock = structuredData
        ? `<script type="application/ld+json">${serializeJsonForHtml(structuredData)}</script>`
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
        `  <meta property="og:type" content="${escapeXml(ogType)}" />`,
        `  <meta property="og:title" content="${safeTitle}" />`,
        `  <meta property="og:description" content="${safeDescription}" />`,
        `  <meta property="og:url" content="${safeCanonical}" />`,
        '  <meta property="og:site_name" content="Kevin Muka" />',
        `  <meta name="twitter:card" content="${twitterCard}" />`,
        `  <meta name="twitter:title" content="${safeTitle}" />`,
        `  <meta name="twitter:description" content="${safeDescription}" />`,
        `  ${ogImageBlock}`,
        `  ${structuredDataBlock}`,
        '</head>',
        '<body>',
        '  <main>',
        `    <h1>${safeTitle}</h1>`,
        `    <p>${safeDescription}</p>`,
        bodyContent,
        '  </main>',
        '</body>',
        '</html>'
    ].join('\n');
}

function renderPhotoSeoHtml(options) {
    const safeContentImage = escapeXml(options.contentUrl || options.imageUrl || '');
    const bodyContent = safeContentImage
        ? [
            '    <figure>',
            `      <img src="${safeContentImage}" alt="${escapeXml(options.title || 'Foto')}" />`,
            `      <figcaption>${escapeXml(options.description || '')}</figcaption>`,
            '    </figure>'
        ].join('\n')
        : '';

    return renderSeoHtml({
        ...options,
        ogType: 'article',
        bodyContent
    });
}

async function handlePhotoSeoPage(req, res, next) {
    try {
        const siteBaseUrl = getSiteBaseUrl();
        const rawId = String(req.params.id || '').trim();
        const decodedPhotoId = decodeURIComponent(rawId);
        const canonicalUrl = `${siteBaseUrl}/photo/${encodeURIComponent(decodedPhotoId)}`;
        const photos = await portfolioRepository.photos.list();
        const photo = photos.find((item) => String(item?.id || '').trim() === decodedPhotoId);

        if (!photo) {
            const notFoundHtml = renderPhotoSeoHtml({
                title: 'Foto non trovata - Kevin Muka',
                description: 'La foto richiesta non è disponibile.',
                canonicalUrl,
                imageUrl: '',
                contentUrl: '',
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
        const contentUrl = resolvePhotoImageUrl(photo, siteBaseUrl, 'full');
        const rightsUrl = `${siteBaseUrl}/rights`;
        const imageObjectId = `${canonicalUrl}#primary-image`;
        const structuredData = {
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'WebPage',
                    '@id': canonicalUrl,
                    url: canonicalUrl,
                    name: title,
                    description,
                    primaryImageOfPage: { '@id': imageObjectId }
                },
                {
                    '@type': 'ImageObject',
                    '@id': imageObjectId,
                    name: photoTitle,
                    description,
                    contentUrl,
                    url: canonicalUrl,
                    creator: { '@type': 'Person', name: 'Kevin Muka' },
                    creditText: 'Kevin Muka',
                    copyrightNotice: '© Kevin Muka. Tutti i diritti riservati.',
                    license: rightsUrl,
                    acquireLicensePage: `${siteBaseUrl}/contact`
                }
            ]
        };
        const html = renderPhotoSeoHtml({
            title,
            description,
            canonicalUrl,
            imageUrl,
            contentUrl,
            structuredData
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        return res.status(200).send(html);
    } catch (error) {
        return next(error);
    }
}

async function handleSeriesIndexSeoPage(req, res, next) {
    try {
        const siteBaseUrl = getSiteBaseUrl();
        const canonicalUrl = `${siteBaseUrl}/series`;
        const [allSeries, photos] = await Promise.all([
            portfolioRepository.series.list(),
            portfolioRepository.photos.list()
        ]);
        const series = allSeries.filter((item) => item.published && item.slug);
        const photosById = new Map(photos.map((photo) => [String(photo?.id || ''), photo]));
        const entries = series.map((item) => {
            const coverPhoto = photosById.get(String(item.coverImage || ''))
                || item.photos.map((photoId) => photosById.get(String(photoId))).find(Boolean)
                || null;
            return {
                series: item,
                url: `${siteBaseUrl}/series/${encodeURIComponent(item.slug)}`,
                coverPhoto
            };
        });
        const title = 'Kevin Muka | Serie Fotografiche';
        const description = 'Serie fotografiche di Kevin Muka: progetti visivi organizzati per tema, luogo e narrazione.';
        const imageUrl = entries[0]?.coverPhoto
            ? resolvePhotoImageUrl(entries[0].coverPhoto, siteBaseUrl, 'social')
            : '';
        const itemListId = `${canonicalUrl}#series-list`;
        const structuredData = {
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'CollectionPage',
                    '@id': canonicalUrl,
                    url: canonicalUrl,
                    name: title,
                    description,
                    mainEntity: { '@id': itemListId }
                },
                {
                    '@type': 'ItemList',
                    '@id': itemListId,
                    name: 'Serie fotografiche di Kevin Muka',
                    numberOfItems: entries.length,
                    itemListElement: entries.map((entry, index) => ({
                        '@type': 'ListItem',
                        position: index + 1,
                        name: entry.series.title,
                        url: entry.url
                    }))
                }
            ]
        };
        const bodyContent = [
            '    <nav aria-label="Serie fotografiche">',
            '      <ul>',
            ...entries.map((entry) => {
                const coverUrl = entry.coverPhoto
                    ? resolvePhotoImageUrl(entry.coverPhoto, siteBaseUrl, 'full')
                    : '';
                return [
                    '        <li>',
                    '          <article>',
                    `            <h2><a href="${escapeXml(entry.url)}">${escapeXml(entry.series.title)}</a></h2>`,
                    coverUrl
                        ? `            <a href="${escapeXml(entry.url)}"><img src="${escapeXml(coverUrl)}" alt="${escapeXml(entry.series.title)}" loading="lazy" /></a>`
                        : '',
                    `            <p>${escapeXml(buildSeriesDescription(entry.series))}</p>`,
                    '          </article>',
                    '        </li>'
                ].filter(Boolean).join('\n');
            }),
            '      </ul>',
            '    </nav>'
        ].join('\n');
        const html = renderSeoHtml({
            title,
            description,
            canonicalUrl,
            imageUrl,
            structuredData,
            ogType: 'website',
            bodyContent
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        return res.status(200).send(html);
    } catch (error) {
        return next(error);
    }
}

async function handleSeriesSeoPage(req, res, next) {
    try {
        const siteBaseUrl = getSiteBaseUrl();
        const rawIdentifier = String(req.params.identifier || '').trim();
        const identifier = decodeURIComponent(rawIdentifier);
        const requestedUrl = `${siteBaseUrl}/series/${encodeURIComponent(identifier)}`;
        const [allSeries, photos] = await Promise.all([
            portfolioRepository.series.list(),
            portfolioRepository.photos.list()
        ]);
        const series = allSeries.find((item) => (
            item.published
            && (String(item.id) === identifier || item.slug === identifier)
        ));

        if (!series) {
            const notFoundHtml = renderSeoHtml({
                title: 'Serie non trovata - Kevin Muka',
                description: 'La serie fotografica richiesta non è disponibile.',
                canonicalUrl: requestedUrl,
                imageUrl: '',
                noindex: true
            });

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=60');
            return res.status(404).send(notFoundHtml);
        }

        const photosById = new Map(photos.map((photo) => [String(photo?.id || ''), photo]));
        const seriesPhotos = series.photos
            .map((photoId) => photosById.get(String(photoId)))
            .filter(Boolean)
            .slice(0, 120);
        const coverPhoto = photosById.get(String(series.coverImage || '')) || seriesPhotos[0] || null;
        const canonicalUrl = `${siteBaseUrl}/series/${encodeURIComponent(series.slug)}`;
        const title = `Kevin Muka | Serie: ${series.title}`;
        const description = buildSeriesDescription(series);
        const imageUrl = coverPhoto
            ? resolvePhotoImageUrl(coverPhoto, siteBaseUrl, 'social')
            : '';
        const rightsUrl = `${siteBaseUrl}/rights`;
        const contactUrl = `${siteBaseUrl}/contact`;
        const galleryId = `${canonicalUrl}#gallery`;
        const imageObjects = seriesPhotos.map((photo) => {
            const photoId = String(photo.id);
            const photoUrl = `${siteBaseUrl}/photo/${encodeURIComponent(photoId)}`;
            return {
                '@type': 'ImageObject',
                '@id': `${photoUrl}#primary-image`,
                name: String(photo.title || series.title || 'Fotografia').trim(),
                description: buildPhotoCaption(photo),
                contentUrl: resolvePhotoImageUrl(photo, siteBaseUrl, 'full'),
                url: photoUrl,
                creator: { '@type': 'Person', name: 'Kevin Muka' },
                creditText: 'Kevin Muka',
                copyrightNotice: '© Kevin Muka. Tutti i diritti riservati.',
                license: rightsUrl,
                acquireLicensePage: contactUrl
            };
        });
        const coverObject = coverPhoto
            ? imageObjects.find((item) => item['@id'] === `${siteBaseUrl}/photo/${encodeURIComponent(String(coverPhoto.id))}#primary-image`)
            : null;
        const structuredData = {
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'CollectionPage',
                    '@id': canonicalUrl,
                    url: canonicalUrl,
                    name: title,
                    description,
                    mainEntity: { '@id': galleryId },
                    ...(coverObject ? { primaryImageOfPage: { '@id': coverObject['@id'] } } : {})
                },
                {
                    '@type': 'ImageGallery',
                    '@id': galleryId,
                    name: series.title,
                    description,
                    url: canonicalUrl,
                    creator: { '@type': 'Person', name: 'Kevin Muka' },
                    associatedMedia: imageObjects
                },
                {
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        {
                            '@type': 'ListItem',
                            position: 1,
                            name: 'Serie',
                            item: `${siteBaseUrl}/series`
                        },
                        {
                            '@type': 'ListItem',
                            position: 2,
                            name: series.title,
                            item: canonicalUrl
                        }
                    ]
                }
            ]
        };
        const narrativeContent = series.content
            .filter((block) => block.type === 'text' && String(block.content || '').trim())
            .map((block) => `    <section><p>${escapeXml(block.content)}</p></section>`)
            .join('\n');
        const galleryContent = seriesPhotos
            .map((photo) => {
                const photoUrl = `${siteBaseUrl}/photo/${encodeURIComponent(String(photo.id))}`;
                const contentUrl = resolvePhotoImageUrl(photo, siteBaseUrl, 'full');
                return [
                    '    <figure>',
                    `      <a href="${escapeXml(photoUrl)}">`,
                    `        <img src="${escapeXml(contentUrl)}" alt="${escapeXml(photo.title || series.title)}" loading="lazy" />`,
                    '      </a>',
                    `      <figcaption>${escapeXml(buildPhotoCaption(photo))}</figcaption>`,
                    '    </figure>'
                ].join('\n');
            })
            .join('\n');
        const html = renderSeoHtml({
            title,
            description,
            canonicalUrl,
            imageUrl,
            structuredData,
            ogType: 'website',
            bodyContent: [narrativeContent, galleryContent].filter(Boolean).join('\n')
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
        const pages = ['/', '/series', '/gallery', '/map', '/about', '/contact', '/rights'];
        const pageEntries = pages
            .map((path) => {
                const pageUrl = `${siteBaseUrl}${path === '/' ? '/' : path}`;
                return [
                    '<url>',
                    `<loc>${escapeXml(pageUrl)}</loc>`,
                    '<changefreq>weekly</changefreq>',
                    path === '/'
                        ? '<priority>1.0</priority>'
                        : path === '/series'
                            ? '<priority>0.9</priority>'
                            : '<priority>0.7</priority>',
                    '</url>'
                ].join('');
            })
            .join('');
        const [photos, allSeries] = await Promise.all([
            portfolioRepository.photos.list(),
            portfolioRepository.series.list()
        ]);
        const series = allSeries.filter((item) => item.published && item.slug);
        const photoEntries = photos
            .map((photo) => {
                const photoId = String(photo?.id || '').trim();
                if (!photoId) return '';

                const photoUrl = `${siteBaseUrl}/photo/${encodeURIComponent(photoId)}`;
                const lastmod = getPhotoLastModifiedIso(photo);
                return [
                    '<url>',
                    `<loc>${escapeXml(photoUrl)}</loc>`,
                    lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '',
                    '<priority>0.6</priority>',
                    '</url>'
                ].join('');
            })
            .filter(Boolean)
            .join('');
        const seriesEntries = series
            .map((item) => {
                const seriesUrl = `${siteBaseUrl}/series/${encodeURIComponent(item.slug)}`;
                const lastmod = getSeriesLastModifiedIso(item);
                return [
                    '<url>',
                    `<loc>${escapeXml(seriesUrl)}</loc>`,
                    lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '',
                    '<priority>0.9</priority>',
                    '</url>'
                ].join('');
            })
            .join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>`
            + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
            + `${pageEntries}${seriesEntries}${photoEntries}`
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
        const photos = await portfolioRepository.photos.list();
        const siteBaseUrl = getSiteBaseUrl();

        const imageEntries = photos
            .map((photo) => {
                const photoId = String(photo.id || '').trim();
                if (!photoId) return '';

                const fullPath = (Array.isArray(photo.assets) ? photo.assets : [])
                    .find((asset) => asset.scope === 'public' && asset.role === 'full')
                    ?.path;
                let fullImage = buildPublicAssetUrl(fullPath);
                if (!fullImage) return '';
                if (!/^https?:\/\//i.test(fullImage)) {
                    if (fullImage.startsWith('/')) {
                        fullImage = `${siteBaseUrl}${fullImage}`;
                    } else {
                        fullImage = `${siteBaseUrl}/${fullImage}`;
                    }
                }

                const landingUrl = `${siteBaseUrl}/photo/${encodeURIComponent(photoId)}`;
                const lastmod = getPhotoLastModifiedIso(photo);

                const title = escapeXml(photo.title || 'Foto');
                const caption = escapeXml(buildPhotoCaption(photo));

                return [
                    '<url>',
                    `<loc>${escapeXml(landingUrl)}</loc>`,
                    lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '',
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
app.get('/series', handleSeriesIndexSeoPage);
app.get('/series/:identifier', handleSeriesSeoPage);

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
