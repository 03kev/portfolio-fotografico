const CLIENT_ERROR_STATUSES = Object.freeze({
    INVALID_ID: 400,
    INVALID_COORDINATE: 400,
    INVALID_EXPECTED_VERSION: 400,
    EXPECTED_VERSION_MISMATCH: 400,
    INVALID_FILE_TYPE: 415,
    LIMIT_FILE_SIZE: 413,
    MEDIA_GENERATION_REQUIRED: 400,
    INVALID_MEDIA_OPERATION_ID: 400,
    INVALID_MEDIA_OPERATION: 400,
    CROP_SETTINGS_REQUIRED: 400,
    VALIDATION_ERROR: 400
});

function compactErrorMessage(value, maxLength = 240) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}

function resolveErrorStatus(error, fallbackStatus = 500) {
    const explicitStatus = Number(error?.status || error?.statusCode || 0);
    if (Number.isFinite(explicitStatus) && explicitStatus >= 400 && explicitStatus < 600) {
        return explicitStatus;
    }

    const codeStatus = CLIENT_ERROR_STATUSES[String(error?.code || '')];
    if (codeStatus) return codeStatus;

    return fallbackStatus;
}

function sanitizeErrorDetails(value, depth = 0) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 1) {
        return undefined;
    }

    const output = {};
    for (const [key, entry] of Object.entries(value).slice(0, 16)) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) continue;
        if (
            typeof entry === 'string'
            || typeof entry === 'number'
            || typeof entry === 'boolean'
            || entry === null
        ) {
            output[key] = typeof entry === 'string'
                ? compactErrorMessage(entry)
                : entry;
            continue;
        }
        const nested = sanitizeErrorDetails(entry, depth + 1);
        if (nested && Object.keys(nested).length > 0) output[key] = nested;
    }

    return Object.keys(output).length > 0 ? output : undefined;
}

function toApiErrorResponse(error, {
    fallbackMessage = 'Errore interno del server',
    fallbackStatus = 500,
    fallbackCode,
    includeServerDetails = false
} = {}) {
    const status = resolveErrorStatus(error, fallbackStatus);
    const isServerError = status >= 500;
    const rawMessage = compactErrorMessage(error?.message || '');
    const code = compactErrorMessage(
        isServerError
            ? (fallbackCode || error?.code || '')
            : (error?.code || fallbackCode || ''),
        80
    );

    const payload = {
        success: false,
        message: isServerError
            ? fallbackMessage
            : (rawMessage || fallbackMessage)
    };

    if (code) payload.code = code;

    if (!isServerError) {
        const details = sanitizeErrorDetails(error?.details);
        if (details) payload.details = details;
    } else if (includeServerDetails) {
        const details = {};
        if (rawMessage && rawMessage !== fallbackMessage) details.reason = rawMessage;
        if (code) details.code = code;
        if (Object.keys(details).length > 0) payload.details = details;
    }

    return { status, payload };
}

function sendApiError(res, error, options = {}) {
    const { status, payload } = toApiErrorResponse(error, options);
    return res.status(status).json(payload);
}

function createApiError(message, status, code, details = undefined) {
    const error = new Error(message);
    error.status = status;
    if (code) error.code = code;
    if (details !== undefined) error.details = details;
    return error;
}

module.exports = {
    compactErrorMessage,
    createApiError,
    resolveErrorStatus,
    sendApiError,
    toApiErrorResponse
};
