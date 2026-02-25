const DEFAULTS = Object.freeze({
    port: 5000,
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

    r2MetadataPrefix: 'data'
});

module.exports = DEFAULTS;
