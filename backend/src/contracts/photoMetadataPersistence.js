const { sanitizePhotoPayload } = require('../utils/inputSanitizers');

const PHOTO_PERSISTED_EDITABLE_FIELDS = Object.freeze([
    'title', 'description', 'date', 'location', 'lat', 'lng',
    'camera', 'lens', 'settings', 'tags'
]);

function pickEditablePhotoMetadata(input = {}) {
    return Object.fromEntries(
        PHOTO_PERSISTED_EDITABLE_FIELDS
            .filter((field) => Object.hasOwn(input, field))
            .map((field) => [field, input[field]])
    );
}

function normalizePhotoMetadataForPersistence(input = {}, { partial = false } = {}) {
    const editable = pickEditablePhotoMetadata(input);
    const normalized = sanitizePhotoPayload(editable, { partial });
    return { ...input, ...normalized };
}

module.exports = {
    PHOTO_PERSISTED_EDITABLE_FIELDS,
    normalizePhotoMetadataForPersistence,
    pickEditablePhotoMetadata
};
