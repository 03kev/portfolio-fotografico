const crypto = require('crypto');

const DEFAULT_SCRYPT_PARAMS = Object.freeze({
    N: 16384,
    r: 8,
    p: 1,
    keylen: 64
});

function safeEqualBuffers(a, b) {
    if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function normalizeToken(rawToken) {
    return String(rawToken || '').trim();
}

function createTokenHash(token, params = DEFAULT_SCRYPT_PARAMS) {
    const normalizedToken = normalizeToken(token);
    if (!normalizedToken) {
        throw new Error('Token vuoto: impossibile generare hash.');
    }

    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(normalizedToken, salt, params.keylen, {
        N: params.N,
        r: params.r,
        p: params.p
    });

    return [
        'scrypt',
        String(params.N),
        String(params.r),
        String(params.p),
        salt.toString('base64'),
        key.toString('base64')
    ].join('$');
}

function parseScryptHash(serializedHash) {
    const raw = String(serializedHash || '').trim();
    if (!raw) return null;

    const [algorithm, nStr, rStr, pStr, saltB64, keyB64] = raw.split('$');
    if (algorithm !== 'scrypt') return null;

    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
        return null;
    }

    try {
        const salt = Buffer.from(String(saltB64 || ''), 'base64');
        const key = Buffer.from(String(keyB64 || ''), 'base64');
        if (!salt.length || !key.length) return null;
        return { N, r, p, salt, key };
    } catch {
        return null;
    }
}

function verifyTokenAgainstHash(token, serializedHash) {
    const normalizedToken = normalizeToken(token);
    if (!normalizedToken) return false;

    const parsed = parseScryptHash(serializedHash);
    if (!parsed) return false;

    const derived = crypto.scryptSync(normalizedToken, parsed.salt, parsed.key.length, {
        N: parsed.N,
        r: parsed.r,
        p: parsed.p
    });

    return safeEqualBuffers(derived, parsed.key);
}

module.exports = {
    createTokenHash,
    verifyTokenAgainstHash
};
