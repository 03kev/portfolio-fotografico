const { env } = require('../config/env');

function isCloudflarePurgeConfigured() {
    return Boolean(env.cloudflareZoneId && env.cloudflareApiToken);
}

function normalizeUploadPathToAbsoluteUrl(uploadPath) {
    const raw = String(uploadPath || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!raw.startsWith('/uploads/')) return '';
    if (!env.r2PublicUrl) return '';

    const objectKey = raw.replace(/^\/+/, '').replace(/^uploads\/+/, '');
    return `${env.r2PublicUrl}/${objectKey}`;
}

async function purgeUrls(urls = [], options = {}) {
    const files = [...new Set(
        urls
            .map((url) => String(url || '').trim())
            .filter((url) => /^https?:\/\//i.test(url))
    )];

    if (!files.length) {
        return { success: true, skipped: true, reason: 'no_files' };
    }

    if (!isCloudflarePurgeConfigured()) {
        return { success: true, skipped: true, reason: 'not_configured' };
    }

    const endpoint = `https://api.cloudflare.com/client/v4/zones/${env.cloudflareZoneId}/purge_cache`;
    const chunkSize = 30;
    let requestCount = 0;

    for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        requestCount += 1;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.cloudflareApiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: chunk })
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
            const message = payload?.errors?.map((error) => error?.message).filter(Boolean).join('; ')
                || `HTTP ${response.status}`;
            const reason = String(options.reason || 'purge');
            throw new Error(`Cloudflare purge failed (${reason}): ${message}`);
        }
    }

    return {
        success: true,
        skipped: false,
        requestCount,
        fileCount: files.length
    };
}

module.exports = {
    isCloudflarePurgeConfigured,
    normalizeUploadPathToAbsoluteUrl,
    purgeUrls
};
