function normalizeR2ObjectPrefix(value) {
    return String(value || '')
        .trim()
        .replace(/^\/+|\/+$/g, '');
}

function stripObjectNamespace(objectKey, prefix) {
    const key = String(objectKey || '').replace(/^\/+/, '');
    const normalizedPrefix = normalizeR2ObjectPrefix(prefix);
    if (!normalizedPrefix) return key;
    if (key === normalizedPrefix) return '';
    if (!key.startsWith(`${normalizedPrefix}/`)) return key;
    return key.slice(normalizedPrefix.length + 1);
}

function namespaceObjectKey(objectKey, prefix) {
    const normalizedPrefix = normalizeR2ObjectPrefix(prefix);
    const key = stripObjectNamespace(objectKey, normalizedPrefix);
    if (!normalizedPrefix) return key;
    return key ? `${normalizedPrefix}/${key}` : normalizedPrefix;
}

function isValidR2ObjectPrefix(value) {
    const normalized = normalizeR2ObjectPrefix(value);
    if (!normalized) return true;

    return normalized.split('/').every((segment) => (
        segment !== '.'
        && segment !== '..'
        && /^[a-zA-Z0-9._-]+$/.test(segment)
    ));
}

module.exports = {
    isValidR2ObjectPrefix,
    namespaceObjectKey,
    normalizeR2ObjectPrefix,
    stripObjectNamespace
};
