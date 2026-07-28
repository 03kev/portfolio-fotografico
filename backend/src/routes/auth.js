const express = require('express');
const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const {
    canAccessAdminData,
    clearSessionCookie,
    hasWriteTokenConfigured,
    isWriteTokenValid,
    setSessionCookie
} = require('../middleware/auth');

const router = express.Router();

const authWindowMs = env.apiAuthRateLimitWindowMs;
const authMaxAttempts = env.apiAuthRateLimitMaxAttempts;
const authLimiter = rateLimit({
    windowMs: authWindowMs,
    max: authMaxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        code: 'AUTH_RATE_LIMITED',
        message: 'Troppi tentativi di autenticazione. Riprova più tardi.'
    }
});

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

router.get('/session', (req, res) => {
    res.json({
        success: true,
        authenticated: canAccessAdminData(req)
    });
});

router.post('/session', authLimiter, async (req, res) => {
    try {
        if (!hasWriteTokenConfigured()) {
            return res.status(503).json({
                success: false,
                code: 'AUTH_NOT_CONFIGURED',
                message: 'Autenticazione admin non configurata sul server.'
            });
        }

        const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        if (!token || !isWriteTokenValid(token)) {
            await wait(350);
            return res.status(401).json({
                success: false,
                code: 'AUTH_INVALID_CREDENTIALS',
                message: 'Credenziali non valide'
            });
        }

        setSessionCookie(res);
        return res.json({
            success: true,
            authenticated: true,
            message: 'Sessione autenticata'
        });
    } catch (error) {
        console.error('Errore creazione sessione auth:', error);
        return res.status(500).json({
            success: false,
            code: 'AUTH_SESSION_FAILED',
            message: 'Errore durante autenticazione sessione'
        });
    }
});

router.delete('/session', (req, res) => {
    clearSessionCookie(res);
    return res.json({
        success: true,
        authenticated: false,
        message: 'Sessione terminata'
    });
});

module.exports = router;
