const DEFAULTS = Object.freeze({
    apiSessionTtlMs: 1000 * 60 * 60 * 24 * 7, // 7 giorni
    apiAuthRateLimitWindowMs: 10 * 60 * 1000,
    apiAuthRateLimitMaxAttempts: 10,

    uploadMaxSize: 50 * 1024 * 1024, // 50MB
    uploadAllowedTypes: ['image/*'],

    rateLimitWindowMs: 10 * 60 * 1000,
    rateLimitMaxRequests: 500,
    writeRateLimitWindowMs: 10 * 60 * 1000,
    writeRateLimitMaxRequests: 120,

    jsonBodyLimit: '2mb',
    urlencodedBodyLimit: '2mb',
    publicAssetCacheControl: 'public, max-age=31536000, immutable',
    r2SignedUploadUrlExpiresSeconds: 600, // 10 minuti
    photoMediaMutationTtlMs: 20 * 60 * 1000, // 20 minuti
    photoCreationLeaseTtlMs: 20 * 60 * 1000, // 20 minuti
    // Scadenza della preparazione pending/processing; i completed restano tombstone.
    photoCreationIntentTtlMs: 24 * 60 * 60 * 1000,

    r2MetadataPrefix: 'data'
});

module.exports = DEFAULTS;
