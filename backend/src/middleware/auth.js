const crypto = require('crypto');
const { env } = require('../config/env');
const { verifyTokenAgainstHash } = require('../utils/tokenHash');

const DEFAULT_SESSION_COOKIE_NAME = 'pf_admin_session';
const DEFAULT_SESSION_TTL_MS = env.apiSessionTtlMs;

function isProduction() {
    return env.isProduction;
}

function getConfiguredWriteToken() {
    return env.apiWriteToken;
}

function getConfiguredWriteTokenHash() {
    return env.apiWriteTokenHash;
}

function getSessionSecret() {
    const explicitSecret = env.apiSessionSecret;

    if (explicitSecret) return explicitSecret;
    if (!isProduction()) {
        return getConfiguredWriteToken();
    }
    return '';
}

function getSessionCookieName() {
    if (env.apiSessionCookieName) {
        return env.apiSessionCookieName;
    }
    // In produzione preferisci il prefisso __Host- per cookie host-only più robusti.
    return isProduction() ? `__Host-${DEFAULT_SESSION_COOKIE_NAME}` : DEFAULT_SESSION_COOKIE_NAME;
}

function getSessionTtlMs() {
    return DEFAULT_SESSION_TTL_MS;
}

function getSessionCookieOptions() {
    return {
        httpOnly: true,
        secure: isProduction(),
        sameSite: isProduction() ? 'strict' : 'lax',
        path: '/',
        maxAge: getSessionTtlMs(),
        priority: 'high'
    };
}

function safeEqual(a, b) {
    const aBuf = Buffer.from(String(a || ''), 'utf8');
    const bBuf = Buffer.from(String(b || ''), 'utf8');

    if (aBuf.length !== bBuf.length) {
        return false;
    }

    return crypto.timingSafeEqual(aBuf, bBuf);
}

function base64UrlEncode(value) {
    return Buffer.from(value, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    const withPadding = padding ? normalized + '='.repeat(4 - padding) : normalized;
    return Buffer.from(withPadding, 'base64').toString('utf8');
}

function createSignature(payloadPart) {
    const secret = getSessionSecret();
    return crypto
        .createHmac('sha256', secret)
        .update(payloadPart)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function hasWriteTokenConfigured() {
    return Boolean(getConfiguredWriteTokenHash() || getConfiguredWriteToken());
}

function isWriteTokenValid(token) {
    const configuredTokenHash = getConfiguredWriteTokenHash();
    if (configuredTokenHash) {
        return verifyTokenAgainstHash(token, configuredTokenHash);
    }

    const configuredToken = getConfiguredWriteToken();
    return Boolean(configuredToken) && safeEqual(token, configuredToken);
}

function createSessionToken() {
    const expiresAt = Date.now() + getSessionTtlMs();
    const payload = {
        role: 'admin',
        exp: expiresAt
    };

    const payloadPart = base64UrlEncode(JSON.stringify(payload));
    const signature = createSignature(payloadPart);
    return `${payloadPart}.${signature}`;
}

function parseCookies(req) {
    const header = req?.headers?.cookie;
    if (!header) return {};

    return header.split(';').reduce((acc, part) => {
        const [rawKey, ...rest] = part.split('=');
        const key = rawKey ? rawKey.trim() : '';
        if (!key) return acc;

        const rawValue = rest.join('=').trim();
        acc[key] = decodeURIComponent(rawValue);
        return acc;
    }, {});
}

function readSessionPayload(req) {
    const cookies = parseCookies(req);
    const token = cookies[getSessionCookieName()];

    if (!token) return null;

    const [payloadPart, signature] = token.split('.');
    if (!payloadPart || !signature) return null;

    const expected = createSignature(payloadPart);
    if (!safeEqual(signature, expected)) return null;

    try {
        const payload = JSON.parse(base64UrlDecode(payloadPart));
        if (!payload || payload.role !== 'admin') return null;
        if (!payload.exp || Date.now() > Number(payload.exp)) return null;
        return payload;
    } catch {
        return null;
    }
}

function setSessionCookie(res) {
    const token = createSessionToken();
    res.cookie(getSessionCookieName(), token, getSessionCookieOptions());
}

function clearSessionCookie(res) {
    const cookieOptions = getSessionCookieOptions();
    res.clearCookie(getSessionCookieName(), {
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path: cookieOptions.path
    });
}

function extractHeaderToken(req) {
    // In produzione supportiamo solo autenticazione con sessione cookie.
    if (isProduction()) {
        return '';
    }

    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }

    const apiKeyHeader = req.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string') {
        return apiKeyHeader.trim();
    }

    return '';
}

function isAuthenticatedRequest(req) {
    if (readSessionPayload(req)) {
        return true;
    }

    const headerToken = extractHeaderToken(req);
    if (headerToken && isWriteTokenValid(headerToken)) {
        return true;
    }

    return false;
}

function requireWriteAuth(req, res, next) {
    if (!hasWriteTokenConfigured()) {
        if (isProduction()) {
            return res.status(503).json({
                success: false,
                message: 'Configurazione auth mancante: API_WRITE_TOKEN_HASH non impostata.'
            });
        }

        return next();
    }

    if (!isAuthenticatedRequest(req)) {
        return res.status(401).json({
            success: false,
            message: 'Non autorizzato'
        });
    }

    return next();
}

function protectWriteMethods(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }

    return requireWriteAuth(req, res, next);
}

module.exports = {
    clearSessionCookie,
    getSessionCookieName,
    getSessionCookieOptions,
    hasWriteTokenConfigured,
    isAuthenticatedRequest,
    isWriteTokenValid,
    protectWriteMethods,
    requireWriteAuth,
    setSessionCookie
};
