const TLS_MODES_REQUIRING_VERIFICATION = new Set([
    'prefer',
    'require',
    'verify-ca'
]);

function normalizePostgresConnectionString(value) {
    const connectionString = String(value || '').trim();
    if (!connectionString) return '';

    let url;
    try {
        url = new URL(connectionString);
    } catch {
        return connectionString;
    }

    const sslMode = String(url.searchParams.get('sslmode') || '').toLowerCase();
    if (TLS_MODES_REQUIRING_VERIFICATION.has(sslMode)) {
        url.searchParams.set('sslmode', 'verify-full');
    }

    return url.toString();
}

module.exports = {
    normalizePostgresConnectionString
};
