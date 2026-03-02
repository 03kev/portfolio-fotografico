const path = require('path');
const dotenv = require('dotenv');
const DEFAULTS = require('./defaults');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function asString(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
}

function asInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function asPositiveInt(value, fallback) {
    const parsed = asInt(value, fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asOptionalPositiveInt(value) {
    const raw = asString(value);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asCsvList(value) {
    return asString(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

const nodeEnv = asString(process.env.NODE_ENV, 'development');
const isProduction = nodeEnv === 'production';
const isDevelopment = nodeEnv !== 'production';

const env = {
    nodeEnv,
    isProduction,
    isDevelopment,
    port: asOptionalPositiveInt(process.env.PORT),
    vercel: Boolean(process.env.VERCEL),
    vercelUrl: asString(process.env.VERCEL_URL),
    siteUrl: asString(process.env.SITE_URL),

    corsOrigins: asCsvList(process.env.CORS_ORIGINS),

    apiWriteToken: asString(process.env.API_WRITE_TOKEN),
    apiWriteTokenHash: asString(process.env.API_WRITE_TOKEN_HASH),
    apiSessionSecret: asString(process.env.API_SESSION_SECRET),
    apiSessionCookieName: asString(process.env.API_SESSION_COOKIE_NAME),
    apiSessionTtlMs: asPositiveInt(process.env.API_SESSION_TTL_MS, DEFAULTS.apiSessionTtlMs),
    apiAuthRateLimitWindowMs: asPositiveInt(process.env.API_AUTH_RATE_LIMIT_WINDOW_MS, DEFAULTS.apiAuthRateLimitWindowMs),
    apiAuthRateLimitMaxAttempts: asPositiveInt(process.env.API_AUTH_RATE_LIMIT_MAX_ATTEMPTS, DEFAULTS.apiAuthRateLimitMaxAttempts),

    r2AccountId: asString(process.env.R2_ACCOUNT_ID),
    r2AccessKeyId: asString(process.env.R2_ACCESS_KEY_ID),
    r2SecretAccessKey: asString(process.env.R2_SECRET_ACCESS_KEY),
    r2Bucket: asString(process.env.R2_BUCKET),
    r2PublicUrl: asString(process.env.R2_PUBLIC_URL).replace(/\/+$/, ''),
    r2Endpoint: asString(process.env.R2_ENDPOINT),
    r2MetadataPrefix: asString(process.env.R2_METADATA_PREFIX, DEFAULTS.r2MetadataPrefix).replace(/^\/+|\/+$/g, '')
};

function validateEnv() {
    const errors = [];
    const warnings = [];

    if (env.isDevelopment && !asString(process.env.PORT)) {
        errors.push('PORT non impostata in development.');
    }

    if (!env.siteUrl) {
        errors.push('SITE_URL non impostata.');
    }

    if (env.isDevelopment && !env.corsOrigins.length) {
        errors.push('CORS_ORIGINS non impostata in development.');
    }

    if (env.isProduction) {
        if (!env.apiWriteTokenHash) {
            errors.push('API_WRITE_TOKEN_HASH non impostata in produzione.');
        }
        if (!env.apiSessionSecret) {
            errors.push('API_SESSION_SECRET non impostata in produzione.');
        }
        if (!env.r2AccountId || !env.r2AccessKeyId || !env.r2SecretAccessKey || !env.r2Bucket) {
            errors.push('Configurazione R2 incompleta in produzione (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).');
        }
        if (!env.corsOrigins.length) {
            warnings.push('CORS_ORIGINS non impostata in produzione: verrà consentito solo VERCEL_URL.');
        }
    }

    if (env.isDevelopment && env.apiWriteToken && !env.apiSessionSecret) {
        warnings.push('API_SESSION_SECRET non impostata: verrà usato API_WRITE_TOKEN come fallback.');
    }

    if (env.isDevelopment && !env.apiWriteTokenHash && !env.apiWriteToken) {
        warnings.push('Nessuna credenziale admin configurata (API_WRITE_TOKEN_HASH / API_WRITE_TOKEN). In locale le write API saranno aperte.');
    }

    if (env.isProduction && env.apiWriteToken) {
        warnings.push('API_WRITE_TOKEN in chiaro è presente in produzione: non è necessario se usi API_WRITE_TOKEN_HASH.');
    }

    if (warnings.length) {
        warnings.forEach((message) => console.warn(`[env] ${message}`));
    }

    if (errors.length) {
        throw new Error(`[env] Configurazione non valida:\n- ${errors.join('\n- ')}`);
    }
}

module.exports = {
    env,
    validateEnv
};
