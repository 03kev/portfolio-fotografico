const assert = require('node:assert/strict');
const test = require('node:test');
const {
    PHOTO_METADATA_FIELDS,
    PHOTO_METADATA_FIELD_KEYS,
    PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH,
    PHOTO_TAG_MAX_ITEMS,
    PHOTO_TAG_MAX_LENGTH,
    assertPhotoMetadataConsumerCoverage,
    assertPhotoMetadataConsumerSet,
    assertPhotoPublicProjection,
    getPhotoMetadataField,
    projectPublicPhotoMetadata
} = require('@portfolio/photo-metadata-contract');
const {
    PHOTO_METADATA_VALIDATION_COVERAGE,
    sanitizePhotoPayload
} = require('../src/utils/inputSanitizers');
const {
    PHOTO_API_PUBLIC_FIELDS,
    PHOTO_METADATA_API_COVERAGE,
    presentPhoto
} = require('../src/routes/photos.helpers');
const {
    PHOTO_METADATA_AUDIT_COVERAGE,
    PHOTO_METADATA_POSTGRES_COVERAGE,
    mapPhotoRow
} = require('../src/repositories/PostgresPortfolioRepository');
const {
    PHOTO_METADATA_IMPORT_EXPORT_COVERAGE,
    PHOTO_METADATA_JSON_COVERAGE,
    toRuntimePhoto,
    toStoragePhoto
} = require('../src/services/photoRecord');
const {
    PHOTO_METADATA_CREATE_PATCH_COVERAGE,
    PHOTO_METADATA_MEDIA_REPLACEMENT_COVERAGE
} = require('../src/contracts/photoMetadataOperations');
const {
    PHOTO_PERSISTED_EDITABLE_FIELDS
} = require('../src/contracts/photoMetadataPersistence');

const backendConsumers = [
    PHOTO_METADATA_VALIDATION_COVERAGE,
    PHOTO_METADATA_POSTGRES_COVERAGE,
    PHOTO_METADATA_JSON_COVERAGE,
    PHOTO_METADATA_IMPORT_EXPORT_COVERAGE,
    PHOTO_METADATA_API_COVERAGE,
    PHOTO_METADATA_CREATE_PATCH_COVERAGE,
    PHOTO_METADATA_AUDIT_COVERAGE,
    PHOTO_METADATA_MEDIA_REPLACEMENT_COVERAGE
];

function validCreate(overrides = {}) {
    return {
        title: 'Titolo valido',
        description: '',
        date: '',
        location: '',
        lat: null,
        lng: null,
        camera: '',
        lens: '',
        settings: { customExif: { preserved: true } },
        tags: [],
        ...overrides
    };
}

test('all mandatory backend consumers explicitly cover the current metadata contract', () => {
    assert.equal(assertPhotoMetadataConsumerSet(backendConsumers, 'backend'), true);
});

test('every real backend consumer fails coverage for a fictitious added or removed field', () => {
    for (const consumer of backendConsumers) {
        assert.throws(
            () => assertPhotoMetadataConsumerCoverage(consumer, {
                contractFields: [...PHOTO_METADATA_FIELD_KEYS, 'futureField']
            }),
            (error) => error.message.includes(consumer.consumer)
                && error.message.includes('futureField')
        );
        assert.throws(
            () => assertPhotoMetadataConsumerCoverage(consumer, {
                contractFields: PHOTO_METADATA_FIELD_KEYS.filter((key) => key !== 'lens')
            }),
            (error) => error.message.includes(consumer.consumer)
                && error.message.includes('lens')
        );
    }
});

test('coverage declarations match validation, persistence, row mapping and API projections', () => {
    assert.deepEqual(
        Object.keys(sanitizePhotoPayload(validCreate())).sort(),
        [...PHOTO_METADATA_VALIDATION_COVERAGE.handled].sort()
    );
    assert.deepEqual(
        [...PHOTO_PERSISTED_EDITABLE_FIELDS].sort(),
        PHOTO_METADATA_CREATE_PATCH_COVERAGE.handled.filter((key) => key !== 'id').sort()
    );

    const mapped = mapPhotoRow({
        id: '1',
        title: 'Titolo valido',
        description: '',
        date_taken: '',
        location_name: '',
        latitude: null,
        longitude: null,
        camera: '',
        lens: '',
        resolution: '',
        settings: {},
        tags: [],
        updated_at_ms: '1',
        derivatives_version: '1',
        media_generation: '01JGFJJZ00XR5RF7YH2J5PVWBX',
        created_at: '2026-08-11T10:00:00.000Z',
        version: '1'
    }, []);
    for (const key of PHOTO_METADATA_POSTGRES_COVERAGE.handled) {
        assert.equal(Object.hasOwn(mapped, key), true, `Mapping Postgres mancante: ${key}`);
    }

    const stored = toStoragePhoto({
        ...mapped,
        assets: [{
            role: 'full',
            replacementGroup: 'derivatives',
            scope: 'public',
            path: `/uploads/photos/1/${mapped.mediaGeneration}/full.webp`,
            contentType: 'image/webp',
            generation: mapped.mediaGeneration
        }]
    });
    for (const consumer of [
        PHOTO_METADATA_JSON_COVERAGE,
        PHOTO_METADATA_IMPORT_EXPORT_COVERAGE
    ]) {
        for (const key of consumer.handled) {
            assert.equal(Object.hasOwn(stored, key), true, `${consumer.id} mancante: ${key}`);
        }
    }

    const presented = presentPhoto(mapped);
    assert.deepEqual(Object.keys(presented).sort(), [...PHOTO_API_PUBLIC_FIELDS].sort());
});

test('public API projection rejects and excludes non-public fields', () => {
    const fieldsWithInternal = [
        ...PHOTO_METADATA_FIELDS,
        { key: 'internalSecret', public: false }
    ];
    assert.throws(
        () => assertPhotoPublicProjection(
            [...PHOTO_API_PUBLIC_FIELDS, 'internalSecret'],
            { fields: fieldsWithInternal }
        ),
        /internalSecret/
    );
    const projected = projectPublicPhotoMetadata(
        { title: 'Visibile', internalSecret: 'non-esporre' },
        ['title'],
        { fields: fieldsWithInternal }
    );
    assert.deepEqual(projected, { title: 'Visibile' });

    const apiPhoto = presentPhoto({
        id: 1,
        ...validCreate(),
        resolution: '',
        createdAt: '2026-08-11T10:00:00.000Z',
        updatedAt: 1,
        version: 1,
        derivativesVersion: 1,
        mediaGeneration: '01JGFJJZ00XR5RF7YH2J5PVWBX',
        assets: [],
        internalSecret: 'non-esporre'
    });
    assert.equal(Object.hasOwn(apiPhoto, 'internalSecret'), false);
});

test('create and partial patch distinguish missing, empty and zero coordinates', () => {
    assert.deepEqual(sanitizePhotoPayload(validCreate()).lat, null);
    assert.deepEqual(
        sanitizePhotoPayload({ lat: 0, lng: 0 }, { partial: true }),
        { lat: 0, lng: 0 }
    );
    assert.deepEqual(
        sanitizePhotoPayload({ location: '' }, { partial: true }),
        { location: '' }
    );
    assert.deepEqual(sanitizePhotoPayload({}, { partial: true }), {});
    assert.throws(
        () => sanitizePhotoPayload({ lat: 0 }, { partial: true }),
        /devono essere modificate insieme/
    );
    assert.throws(
        () => sanitizePhotoPayload({ tags: null }, { partial: true }),
        /deve essere un array/
    );
    assert.throws(
        () => sanitizePhotoPayload({ settings: null }, { partial: true }),
        /deve essere un oggetto/
    );
    for (const field of ['title', 'description', 'date', 'location', 'camera', 'lens']) {
        assert.throws(
            () => sanitizePhotoPayload({ [field]: null }, { partial: true }),
            (error) => error.details?.reason === 'INVALID_STRING_TYPE'
        );
    }
});

test('tag overflow, excessive length and duplicates fail without truncation', () => {
    assert.throws(
        () => sanitizePhotoPayload({
            tags: Array.from({ length: PHOTO_TAG_MAX_ITEMS + 1 }, (_, index) => `tag-${index}`)
        }, { partial: true }),
        (error) => error.details?.maximumItems === PHOTO_TAG_MAX_ITEMS
    );
    assert.throws(
        () => sanitizePhotoPayload({ tags: ['x'.repeat(PHOTO_TAG_MAX_LENGTH + 1)] }, { partial: true }),
        (error) => error.details?.maximumLength === PHOTO_TAG_MAX_LENGTH
    );
    assert.throws(
        () => sanitizePhotoPayload({ tags: ['Roma', 'roma'] }, { partial: true }),
        (error) => error.details?.reason === 'DUPLICATE_TAG'
    );
});

test('all editorial string, coordinate and settings boundaries are enforced', () => {
    for (const field of ['description', 'date', 'location', 'camera', 'lens']) {
        const maximum = getPhotoMetadataField(field).limits.maxLength;
        assert.equal(
            sanitizePhotoPayload({ [field]: 'x'.repeat(maximum) }, { partial: true })[field].length,
            maximum
        );
        assert.throws(
            () => sanitizePhotoPayload({ [field]: 'x'.repeat(maximum + 1) }, { partial: true }),
            (error) => error.details?.maximumLength === maximum
        );
    }
    assert.deepEqual(
        sanitizePhotoPayload({ lat: -90, lng: 180 }, { partial: true }),
        { lat: -90, lng: 180 }
    );
    assert.throws(
        () => sanitizePhotoPayload({ lat: -90.1, lng: 0 }, { partial: true }),
        (error) => error.details?.minimum === -90
    );
    assert.throws(
        () => sanitizePhotoPayload({
            settings: { payload: 'x'.repeat(PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH) }
        }, { partial: true }),
        (error) => error.details?.maximumLength === PHOTO_SETTINGS_MAX_SERIALIZED_LENGTH
    );
});

test('settings preserve unknown EXIF/system keys through canonical JSON and API', () => {
    const generation = '01JGFJJZ00XR5RF7YH2J5PVWBX';
    const runtime = {
        id: 7001,
        ...validCreate({ lat: 0, lng: 0 }),
        resolution: '1200x800',
        createdAt: '2026-08-11T10:00:00.000Z',
        updatedAt: 42,
        version: 3,
        derivativesVersion: 42,
        mediaGeneration: generation,
        assets: [{
            role: 'full',
            replacementGroup: 'derivatives',
            scope: 'public',
            path: `/uploads/photos/7001/${generation}/full.webp`,
            contentType: 'image/webp',
            generation
        }]
    };
    const stored = toStoragePhoto(runtime);
    const roundTrip = toRuntimePhoto(stored);
    assert.deepEqual(roundTrip.settings, runtime.settings);
    assert.equal(roundTrip.lat, 0);
    assert.equal(roundTrip.lng, 0);
    assert.equal(roundTrip.createdAt, runtime.createdAt);
    assert.equal(roundTrip.version, runtime.version);
    assert.deepEqual(presentPhoto(roundTrip).settings, runtime.settings);
});

test('explicit migration accepts the historical nested location without stringifying it', () => {
    const generation = '01JGFJJZ00XR5RF7YH2J5PVWBY';
    const migrated = toRuntimePhoto({
        id: 7002,
        title: 'Luogo storico',
        location: { name: 'Roma', lat: 0, lng: 0 },
        settings: {},
        tags: [],
        derivativesVersion: 7002,
        mediaGeneration: generation,
        assets: [{
            role: 'full',
            replacementGroup: 'derivatives',
            scope: 'public',
            path: `/uploads/photos/7002/${generation}/full.webp`,
            contentType: 'image/webp',
            generation
        }]
    });
    assert.equal(migrated.location, 'Roma');
    assert.equal(migrated.lat, 0);
    assert.equal(migrated.lng, 0);
});
