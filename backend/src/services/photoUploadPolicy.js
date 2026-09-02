const sharp = require('sharp');
const {
    PHOTO_UPLOAD_FORMATS,
    PHOTO_UPLOAD_MAX_BYTES,
    findPhotoUploadFormatByMimeType,
    findPhotoUploadFormatBySharpFormat,
    formatPhotoUploadMaxSize,
    normalizeMimeType,
    validatePhotoUploadDeclaration
} = require('@portfolio/photo-upload-contract');

function createPhotoSourceError(message, status, code, details) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    if (details !== undefined) error.details = details;
    return error;
}

function validateDeclaredPhotoUpload({ contentType, fileSize }) {
    return validatePhotoUploadDeclaration({ contentType, fileSize });
}

function assertPhotoUploadSize(byteLength, maxBytes = PHOTO_UPLOAD_MAX_BYTES) {
    const size = Number(byteLength);
    if (!Number.isSafeInteger(size) || size <= 0) {
        throw createPhotoSourceError(
            'Il file caricato è vuoto o ha una dimensione non valida.',
            422,
            'PHOTO_SOURCE_INVALID_SIZE'
        );
    }
    if (size > maxBytes) {
        throw createPhotoSourceError(
            `Il file caricato supera il limite di ${formatPhotoUploadMaxSize(maxBytes)}.`,
            413,
            'PHOTO_SOURCE_TOO_LARGE',
            { maxBytes, actualBytes: size }
        );
    }
    return size;
}

async function validateUploadedPhotoSourceObject(sourceObject, {
    expectedContentType,
    maxBytes = PHOTO_UPLOAD_MAX_BYTES
} = {}) {
    if (!sourceObject?.buffer || !Buffer.isBuffer(sourceObject.buffer)) {
        throw createPhotoSourceError(
            'File originale non trovato nello storage.',
            404,
            'PHOTO_SOURCE_NOT_FOUND'
        );
    }

    const bufferSize = assertPhotoUploadSize(sourceObject.buffer.length, maxBytes);
    if (sourceObject.contentLength !== undefined && sourceObject.contentLength !== null) {
        const objectSize = assertPhotoUploadSize(sourceObject.contentLength, maxBytes);
        if (objectSize !== bufferSize) {
            throw createPhotoSourceError(
                'La dimensione del file caricato non coincide con quella registrata dallo storage.',
                422,
                'PHOTO_SOURCE_SIZE_MISMATCH',
                { storageBytes: objectSize, actualBytes: bufferSize }
            );
        }
    }

    const expectedFormat = findPhotoUploadFormatByMimeType(expectedContentType);
    if (!expectedFormat) {
        throw createPhotoSourceError(
            'Il tipo di file prenotato non è più supportato.',
            415,
            'PHOTO_SOURCE_EXPECTED_TYPE_UNSUPPORTED'
        );
    }

    const storedContentType = normalizeMimeType(sourceObject.contentType);
    const storedFormat = findPhotoUploadFormatByMimeType(storedContentType);
    if (!storedFormat) {
        throw createPhotoSourceError(
            'Il Content-Type dell’oggetto caricato non è supportato.',
            415,
            'PHOTO_SOURCE_CONTENT_TYPE_UNSUPPORTED',
            { contentType: storedContentType || null }
        );
    }
    if (storedFormat.key !== expectedFormat.key) {
        throw createPhotoSourceError(
            'Il Content-Type dell’oggetto non corrisponde al formato prenotato.',
            415,
            'PHOTO_SOURCE_CONTENT_TYPE_MISMATCH',
            {
                expectedContentType: expectedFormat.canonicalMimeType,
                actualContentType: storedFormat.canonicalMimeType
            }
        );
    }

    let metadata;
    try {
        metadata = await sharp(sourceObject.buffer, { failOn: 'error' }).metadata();
    } catch {
        throw createPhotoSourceError(
            'Il file caricato non è un’immagine valida o è incompleto.',
            422,
            'PHOTO_SOURCE_INVALID'
        );
    }

    const detectedFormat = findPhotoUploadFormatBySharpFormat(metadata?.format);
    if (!detectedFormat) {
        throw createPhotoSourceError(
            `Il formato reale dell’immagine non è supportato. Usa ${PHOTO_UPLOAD_FORMATS.map((format) => format.label).join(', ')}.`,
            415,
            'PHOTO_SOURCE_FORMAT_UNSUPPORTED',
            { detectedFormat: String(metadata?.format || '') || null }
        );
    }
    if (detectedFormat.key !== expectedFormat.key) {
        throw createPhotoSourceError(
            'Il formato reale dell’immagine non corrisponde al tipo dichiarato.',
            415,
            'PHOTO_SOURCE_FORMAT_MISMATCH',
            {
                expectedContentType: expectedFormat.canonicalMimeType,
                actualContentType: detectedFormat.canonicalMimeType
            }
        );
    }

    const width = Number(metadata?.width || 0);
    const height = Number(metadata?.height || 0);
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
        throw createPhotoSourceError(
            'Non è stato possibile leggere dimensioni valide dall’immagine.',
            422,
            'PHOTO_SOURCE_INVALID_DIMENSIONS'
        );
    }

    return {
        buffer: sourceObject.buffer,
        byteLength: bufferSize,
        contentType: detectedFormat.canonicalMimeType,
        extension: detectedFormat.preferredExtension,
        format: detectedFormat.key,
        width,
        height
    };
}

module.exports = {
    assertPhotoUploadSize,
    validateDeclaredPhotoUpload,
    validateUploadedPhotoSourceObject
};
