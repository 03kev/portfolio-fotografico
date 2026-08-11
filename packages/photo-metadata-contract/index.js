const PHOTO_TAG_MAX_ITEMS = 20;
const PHOTO_TAG_MAX_LENGTH = 40;
const PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH = 65_536;

const PHOTO_METADATA_REQUIRED_CONSUMERS = Object.freeze({
    backend: Object.freeze([
        'backend.validation',
        'backend.postgres-persistence',
        'backend.json-snapshot',
        'backend.import-export',
        'backend.api-serialization',
        'backend.create-patch',
        'backend.audit-history',
        'backend.media-replacement'
    ]),
    frontend: Object.freeze([
        'frontend.admin-form',
        'frontend.public-details',
        'frontend.public-seo',
        'frontend.public-map'
    ])
});

function defineField(definition) {
    return Object.freeze({
        ...definition,
        limits: definition.limits ? Object.freeze({ ...definition.limits }) : null,
        editableSettings: definition.editableSettings
            ? Object.freeze([...definition.editableSettings])
            : undefined,
        systemSettings: definition.systemSettings
            ? Object.freeze([...definition.systemSettings])
            : undefined
    });
}

const PHOTO_METADATA_FIELDS = Object.freeze([
    defineField({ key: 'id', ownership: 'identity', editable: false, nullable: false, public: true }),
    defineField({
        key: 'title', ownership: 'editorial', editable: true, nullable: false, public: true,
        requiredOnCreate: true, limits: { minLength: 3, maxLength: 120 }
    }),
    defineField({
        key: 'description', ownership: 'editorial', editable: true, nullable: false, public: true,
        limits: { maxLength: 4000 }
    }),
    defineField({
        key: 'date', ownership: 'editorial-exif', editable: true, nullable: false, public: true,
        limits: { maxLength: 40 }
    }),
    defineField({
        key: 'location', ownership: 'editorial-exif', editable: true, nullable: false, public: true,
        limits: { maxLength: 160 }
    }),
    defineField({
        key: 'lat', ownership: 'editorial-exif', editable: true, nullable: true, public: true,
        limits: { minimum: -90, maximum: 90 }
    }),
    defineField({
        key: 'lng', ownership: 'editorial-exif', editable: true, nullable: true, public: true,
        limits: { minimum: -180, maximum: 180 }
    }),
    defineField({
        key: 'camera', ownership: 'editorial-exif', editable: true, nullable: false, public: true,
        limits: { maxLength: 120 }
    }),
    defineField({
        key: 'lens', ownership: 'editorial-exif', editable: true, nullable: false, public: true,
        limits: { maxLength: 120 }
    }),
    defineField({
        key: 'resolution', ownership: 'derived-sharp', editable: false, nullable: false, public: true,
        limits: { maxLength: 120 }
    }),
    defineField({
        key: 'settings', ownership: 'mixed', editable: true, nullable: false, public: true,
        limits: { maxSerializedLength: PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH },
        editableSettings: ['aperture', 'shutter', 'iso', 'focal'],
        systemSettings: ['cropProfiles']
    }),
    defineField({
        key: 'tags', ownership: 'editorial', editable: true, nullable: false, public: true,
        limits: { maxItems: PHOTO_TAG_MAX_ITEMS, itemMaxLength: PHOTO_TAG_MAX_LENGTH }
    }),
    defineField({ key: 'createdAt', ownership: 'database', editable: false, nullable: true, public: true }),
    defineField({ key: 'updatedAt', ownership: 'system-clock', editable: false, nullable: false, public: true }),
    defineField({ key: 'version', ownership: 'database', editable: false, nullable: true, public: true }),
    defineField({ key: 'derivativesVersion', ownership: 'media-lifecycle', editable: false, nullable: false, public: true }),
    defineField({ key: 'mediaGeneration', ownership: 'media-lifecycle', editable: false, nullable: false, public: true }),
    defineField({ key: 'assets', ownership: 'asset-registry', editable: false, nullable: false, public: true })
]);

const PHOTO_METADATA_FIELD_KEYS = Object.freeze(
    PHOTO_METADATA_FIELDS.map((field) => field.key)
);
const PHOTO_EDITABLE_FIELD_KEYS = Object.freeze(
    PHOTO_METADATA_FIELDS.filter((field) => field.editable).map((field) => field.key)
);
const PHOTO_READ_ONLY_FIELD_KEYS = Object.freeze(
    PHOTO_METADATA_FIELDS.filter((field) => !field.editable).map((field) => field.key)
);
const FIELD_BY_KEY = new Map(PHOTO_METADATA_FIELDS.map((field) => [field.key, field]));

class PhotoMetadataContractError extends TypeError {
    constructor(message, field, details = {}) {
        super(message);
        this.name = 'PhotoMetadataContractError';
        this.status = 400;
        this.code = 'VALIDATION_ERROR';
        this.details = { field, ...details };
    }
}

function getPhotoMetadataField(key) {
    const field = FIELD_BY_KEY.get(String(key || ''));
    if (!field) throw new TypeError(`Campo metadata foto sconosciuto: "${key}".`);
    return field;
}

function assertPhotoMetadataConsumerCoverage(declaration, {
    contractFields = PHOTO_METADATA_FIELD_KEYS
} = {}) {
    const consumer = String(declaration?.consumer || 'Consumer metadata foto');
    const handled = Array.isArray(declaration?.handled) ? declaration.handled : [];
    const excluded = declaration?.excluded && typeof declaration.excluded === 'object'
        ? declaration.excluded
        : {};
    const excludedKeys = Object.keys(excluded);
    const declared = [...handled, ...excludedKeys];
    const duplicates = declared.filter((key, index) => declared.indexOf(key) !== index);
    const missing = contractFields.filter((key) => !declared.includes(key));
    const unknown = declared.filter((key) => !contractFields.includes(key));
    const unexplained = excludedKeys.filter((key) => !String(excluded[key] || '').trim());

    if (duplicates.length || missing.length || unknown.length || unexplained.length) {
        throw new Error(
            `${consumer} non copre il contratto metadata foto.`
            + ` Mancanti: ${[...new Set(missing)].join(', ') || 'nessuno'}.`
            + ` Sconosciuti: ${[...new Set(unknown)].join(', ') || 'nessuno'}.`
            + ` Duplicati: ${[...new Set(duplicates)].join(', ') || 'nessuno'}.`
            + ` Esclusioni senza motivo: ${unexplained.join(', ') || 'nessuna'}.`
        );
    }
    return true;
}

function definePhotoMetadataConsumer(declaration) {
    assertPhotoMetadataConsumerCoverage(declaration);
    return Object.freeze({
        id: String(declaration.id || ''),
        consumer: declaration.consumer,
        handled: Object.freeze([...(declaration.handled || [])]),
        excluded: Object.freeze({ ...(declaration.excluded || {}) })
    });
}

function assertPhotoMetadataConsumerSet(declarations, area) {
    const required = PHOTO_METADATA_REQUIRED_CONSUMERS[area];
    if (!required) throw new TypeError(`Area consumer metadata sconosciuta: "${area}".`);
    const ids = (Array.isArray(declarations) ? declarations : [])
        .map((declaration) => String(declaration?.id || ''));
    const missing = required.filter((id) => !ids.includes(id));
    const unexpected = ids.filter((id) => !required.includes(id));
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (missing.length || unexpected.length || duplicates.length) {
        throw new Error(
            `Set consumer metadata foto incompleto per ${area}.`
            + ` Mancanti: ${missing.join(', ') || 'nessuno'}.`
            + ` Inattesi: ${unexpected.join(', ') || 'nessuno'}.`
            + ` Duplicati: ${[...new Set(duplicates)].join(', ') || 'nessuno'}.`
        );
    }
    return true;
}

function assertPhotoPublicProjection(fieldKeys, {
    fields = PHOTO_METADATA_FIELDS,
    projectionName = 'Proiezione pubblica metadata foto'
} = {}) {
    const definitions = new Map(fields.map((field) => [field.key, field]));
    const keys = Array.isArray(fieldKeys) ? fieldKeys : [];
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    const unknown = keys.filter((key) => !definitions.has(key));
    const nonPublic = keys.filter((key) => definitions.get(key)?.public !== true);
    if (duplicates.length || unknown.length || nonPublic.length) {
        throw new Error(
            `${projectionName} non è valida.`
            + ` Sconosciuti: ${[...new Set(unknown)].join(', ') || 'nessuno'}.`
            + ` Non pubblici: ${[...new Set(nonPublic)].join(', ') || 'nessuno'}.`
            + ` Duplicati: ${[...new Set(duplicates)].join(', ') || 'nessuno'}.`
        );
    }
    return true;
}

function projectPublicPhotoMetadata(record, fieldKeys, options = {}) {
    assertPhotoPublicProjection(fieldKeys, options);
    return Object.fromEntries(
        fieldKeys
            .filter((key) => Object.hasOwn(record || {}, key))
            .map((key) => [key, record[key]])
    );
}

function parseJsonValue(value, field) {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        throw new PhotoMetadataContractError(
            `${field} deve contenere JSON valido.`,
            field,
            { reason: 'INVALID_JSON' }
        );
    }
}

function normalizePhotoTags(value, { field = 'tags' } = {}) {
    const parsed = parseJsonValue(value, field);
    if (!Array.isArray(parsed)) {
        throw new PhotoMetadataContractError('tags deve essere un array.', field, {
            reason: 'INVALID_TAGS_TYPE'
        });
    }
    if (parsed.length > PHOTO_TAG_MAX_ITEMS) {
        throw new PhotoMetadataContractError(
            `Una foto può avere al massimo ${PHOTO_TAG_MAX_ITEMS} tag.`,
            field,
            { maximumItems: PHOTO_TAG_MAX_ITEMS, actualItems: parsed.length }
        );
    }

    const seen = new Set();
    return parsed.map((item, index) => {
        if (typeof item !== 'string') {
            throw new PhotoMetadataContractError(
                'Ogni tag deve essere una stringa.',
                `${field}[${index}]`,
                { reason: 'INVALID_TAG_TYPE' }
            );
        }
        const tag = item.trim();
        if (!tag) {
            throw new PhotoMetadataContractError(
                'I tag vuoti non sono ammessi.',
                `${field}[${index}]`,
                { minimumLength: 1 }
            );
        }
        if (tag.length > PHOTO_TAG_MAX_LENGTH) {
            throw new PhotoMetadataContractError(
                `Un tag può contenere al massimo ${PHOTO_TAG_MAX_LENGTH} caratteri.`,
                `${field}[${index}]`,
                { maximumLength: PHOTO_TAG_MAX_LENGTH, actualLength: tag.length }
            );
        }
        const identity = tag.toLocaleLowerCase('it-IT');
        if (seen.has(identity)) {
            throw new PhotoMetadataContractError(
                `Tag duplicato: "${tag}".`,
                `${field}[${index}]`,
                { reason: 'DUPLICATE_TAG', value: tag }
            );
        }
        seen.add(identity);
        return tag;
    });
}

function normalizePhotoSettings(value, { field = 'settings' } = {}) {
    const parsed = parseJsonValue(value, field);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new PhotoMetadataContractError('settings deve essere un oggetto.', field, {
            reason: 'INVALID_SETTINGS_TYPE'
        });
    }
    const serialized = JSON.stringify(parsed);
    if (serialized.length > PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH) {
        throw new PhotoMetadataContractError(
            `settings supera ${PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH} caratteri serializzati.`,
            field,
            {
                maximumLength: PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH,
                actualLength: serialized.length
            }
        );
    }
    return parsed;
}

function normalizePhotoCoordinate(value, key) {
    const field = getPhotoMetadataField(key);
    if (!['lat', 'lng'].includes(field.key)) {
        throw new TypeError(`${key} non è una coordinata fotografica.`);
    }
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    if (
        !Number.isFinite(parsed)
        || parsed < field.limits.minimum
        || parsed > field.limits.maximum
    ) {
        throw new PhotoMetadataContractError(
            `${key} deve essere compreso tra ${field.limits.minimum} e ${field.limits.maximum}.`,
            key,
            {
                minimum: field.limits.minimum,
                maximum: field.limits.maximum,
                value
            }
        );
    }
    return parsed;
}

module.exports = {
    PHOTO_EDITABLE_FIELD_KEYS,
    PHOTO_METADATA_FIELDS,
    PHOTO_METADATA_FIELD_KEYS,
    PHOTO_METADATA_REQUIRED_CONSUMERS,
    PHOTO_READ_ONLY_FIELD_KEYS,
    PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH,
    PHOTO_TAG_MAX_ITEMS,
    PHOTO_TAG_MAX_LENGTH,
    PhotoMetadataContractError,
    assertPhotoMetadataConsumerCoverage,
    assertPhotoMetadataConsumerSet,
    assertPhotoPublicProjection,
    definePhotoMetadataConsumer,
    getPhotoMetadataField,
    normalizePhotoCoordinate,
    normalizePhotoSettings,
    normalizePhotoTags,
    projectPublicPhotoMetadata
};
