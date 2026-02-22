const express = require('express');
const {
    clearSessionCookie,
    hasWriteTokenConfigured,
    isAuthenticatedRequest,
    isWriteTokenValid,
    setSessionCookie
} = require('../middleware/auth');

const router = express.Router();

router.get('/session', (req, res) => {
    res.json({
        success: true,
        authenticated: isAuthenticatedRequest(req)
    });
});

router.post('/session', (req, res) => {
    try {
        if (!hasWriteTokenConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Configurazione auth mancante: API_WRITE_TOKEN non impostata.'
            });
        }

        const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        if (!token || !isWriteTokenValid(token)) {
            return res.status(401).json({
                success: false,
                message: 'Token non valido'
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
