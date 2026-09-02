const MEBIBYTE = 1024 * 1024;

const PHOTO_UPLOAD_MAX_BYTES = 50 * MEBIBYTE;

function definePhotoUploadFormat(definition) {
    const key = String(definition?.key || '').trim().toLowerCase();
    const label = String(definition?.label || '').trim();
    const canonicalMimeType = String(definition?.canonicalMimeType || '')
        .trim()
        .toLowerCase();
    const mimeTypes = [...new Set(
        [canonicalMimeType, ...(definition?.mimeTypes || [])]
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean)
    )];
    const extensions = [...new Set(
        (definition?.extensions || [])
            .map((value) => String(value || '').trim().toLowerCase().replace(/^\./, ''))
            .filter(Boolean)
    )];
    const sharpFormat = String(definition?.sharpFormat || key).trim().toLowerCase();

    if (!/^[a-z][a-z0-9-]{1,31}$/.test(key)) {
        throw new TypeError('Chiave formato upload non valida.');
    }
    if (!label) {
        throw new TypeError(`Label formato upload mancante: ${key}.`);
    }
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(canonicalMimeType)) {
        throw new TypeError(`MIME type canonico non valido: ${key}.`);
    }
    if (
        mimeTypes.length === 0
        || mimeTypes.some((value) => !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(value))
    ) {
        throw new TypeError(`MIME type non validi: ${key}.`);
    }
    if (
        extensions.length === 0
        || extensions.some((value) => !/^[a-z0-9]{1,12}$/.test(value))
    ) {
        throw new TypeError(`Estensioni non valide: ${key}.`);
    }
    if (!/^[a-z0-9-]{2,31}$/.test(sharpFormat)) {
        throw new TypeError(`Formato Sharp non valido: ${key}.`);
    }

    return Object.freeze({
        key,
        label,
        canonicalMimeType,
        mimeTypes: Object.freeze(mimeTypes),
        extensions: Object.freeze(extensions),
        preferredExtension: extensions[0],
        sharpFormat
    });
}

function createPhotoUploadFormatCatalog(definitions) {
    if (!Array.isArray(definitions) || definitions.length === 0) {
        throw new TypeError('Il catalogo formati upload non può essere vuoto.');
    }
    const formats = definitions.map(definePhotoUploadFormat);
    const keys = new Set();
    const mimeTypes = new Set();
    const extensions = new Set();
    const sharpFormats = new Set();

    for (const format of formats) {
        if (keys.has(format.key)) {
            throw new TypeError(`Formato upload duplicato: ${format.key}.`);
        }
        keys.add(format.key);
        for (const mimeType of format.mimeTypes) {
            if (mimeTypes.has(mimeType)) {
                throw new TypeError(`MIME type upload duplicato: ${mimeType}.`);
            }
            mimeTypes.add(mimeType);
        }
        for (const extension of format.extensions) {
            if (extensions.has(extension)) {
                throw new TypeError(`Estensione upload duplicata: ${extension}.`);
            }
            extensions.add(extension);
        }
        if (sharpFormats.has(format.sharpFormat)) {
            throw new TypeError(`Formato Sharp duplicato: ${format.sharpFormat}.`);
        }
        sharpFormats.add(format.sharpFormat);
    }
    return Object.freeze(formats);
}

const PHOTO_UPLOAD_FORMATS = createPhotoUploadFormatCatalog([
    {
        key: 'jpeg',
        label: 'JPG',
        canonicalMimeType: 'image/jpeg',
        mimeTypes: ['image/jpg'],
        extensions: ['jpg', 'jpeg'],
        sharpFormat: 'jpeg'
    },
    {
        key: 'png',
        label: 'PNG',
        canonicalMimeType: 'image/png',
        extensions: ['png'],
        sharpFormat: 'png'
    },
    {
        key: 'webp',
        label: 'WebP',
        canonicalMimeType: 'image/webp',
        extensions: ['webp'],
        sharpFormat: 'webp'
    }
]);

function normalizeMimeType(value) {
    return String(value || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
}

function normalizeFileExtension(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^\./, '')
        .replace(/[^a-z0-9]/g, '');
}

function findPhotoUploadFormatByMimeType(value, formats = PHOTO_UPLOAD_FORMATS) {
    const mimeType = normalizeMimeType(value);
    return formats.find((format) => format.mimeTypes.includes(mimeType)) || null;
}

function findPhotoUploadFormatByExtension(value, formats = PHOTO_UPLOAD_FORMATS) {
    const extension = normalizeFileExtension(value);
    return formats.find((format) => format.extensions.includes(extension)) || null;
}

function findPhotoUploadFormatBySharpFormat(value, formats = PHOTO_UPLOAD_FORMATS) {
    const sharpFormat = String(value || '').trim().toLowerCase();
    return formats.find((format) => format.sharpFormat === sharpFormat) || null;
}

function normalizePhotoUploadMimeType(value, formats = PHOTO_UPLOAD_FORMATS) {
    return findPhotoUploadFormatByMimeType(value, formats)?.canonicalMimeType || '';
}

function getPhotoUploadExtensionForMimeType(value, formats = PHOTO_UPLOAD_FORMATS) {
    return findPhotoUploadFormatByMimeType(value, formats)?.preferredExtension || '';
}

function formatPhotoUploadMaxSize(maxBytes = PHOTO_UPLOAD_MAX_BYTES) {
    const mebibytes = Number(maxBytes) / MEBIBYTE;
    return Number.isInteger(mebibytes)
        ? `${mebibytes} MB`
        : `${mebibytes.toFixed(1)} MB`;
}

const PHOTO_UPLOAD_ACCEPT = [...new Set(
    PHOTO_UPLOAD_FORMATS.flatMap((format) => [
        ...format.extensions.map((extension) => `.${extension}`),
        ...format.mimeTypes
    ])
)].join(',');

const PHOTO_UPLOAD_FORMAT_LABEL = PHOTO_UPLOAD_FORMATS
    .map((format) => format.label)
    .join(', ');

const PHOTO_UPLOAD_MAX_SIZE_LABEL = formatPhotoUploadMaxSize();
const PHOTO_UPLOAD_HINT = `Formati ${PHOTO_UPLOAD_FORMAT_LABEL} · Max ${PHOTO_UPLOAD_MAX_SIZE_LABEL}`;

function createPhotoUploadContractError(message, code, status, details) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    if (details !== undefined) error.details = details;
    return error;
}

function validatePhotoUploadDeclaration({ contentType, fileSize }, {
    formats = PHOTO_UPLOAD_FORMATS,
    maxBytes = PHOTO_UPLOAD_MAX_BYTES,
    requireSize = true
} = {}) {
    const format = findPhotoUploadFormatByMimeType(contentType, formats);
    if (!format) {
        throw createPhotoUploadContractError(
            `Tipo di file non supportato. Usa ${formats.map((entry) => entry.label).join(', ')}.`,
            'INVALID_FILE_TYPE',
            415,
            { allowedMimeTypes: formats.map((entry) => entry.canonicalMimeType) }
        );
    }

    const size = Number(fileSize);
    if (!Number.isSafeInteger(size) || size <= 0) {
        if (!requireSize && (fileSize === undefined || fileSize === null || fileSize === '')) {
            return {
                format,
                contentType: format.canonicalMimeType,
                extension: format.preferredExtension,
                fileSize: null
            };
        }
        throw createPhotoUploadContractError(
            'Dimensione del file non valida.',
            'INVALID_FILE_SIZE',
            400
        );
    }
    if (size > maxBytes) {
        throw createPhotoUploadContractError(
            `File troppo grande. Massimo ${formatPhotoUploadMaxSize(maxBytes)}.`,
            'LIMIT_FILE_SIZE',
            413,
            { maxBytes, actualBytes: size }
        );
    }

    return {
        format,
        contentType: format.canonicalMimeType,
        extension: format.preferredExtension,
        fileSize: size
    };
}

module.exports = {
    PHOTO_UPLOAD_ACCEPT,
    PHOTO_UPLOAD_FORMAT_LABEL,
    PHOTO_UPLOAD_FORMATS,
    PHOTO_UPLOAD_HINT,
    PHOTO_UPLOAD_MAX_BYTES,
    PHOTO_UPLOAD_MAX_SIZE_LABEL,
    createPhotoUploadFormatCatalog,
    definePhotoUploadFormat,
    findPhotoUploadFormatByExtension,
    findPhotoUploadFormatByMimeType,
    findPhotoUploadFormatBySharpFormat,
    formatPhotoUploadMaxSize,
    getPhotoUploadExtensionForMimeType,
    normalizeFileExtension,
    normalizeMimeType,
    normalizePhotoUploadMimeType,
    validatePhotoUploadDeclaration
};
