const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeBlockType } = require('@portfolio/series-content-contract');
const { toRuntimePhoto } = require('./photoRecord');
const { sanitizePhotoPayload } = require('../utils/inputSanitizers');
const {
    normalizePublishedPhotoAssetInventory
} = require('./photoAssetLifecycle');
const {
    createSeriesSlug,
    normalizeSeriesRecord,
    normalizeSeriesTitleKey
} = require('./seriesRecord');

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Temporary import-only compatibility boundary. Runtime repositories and APIs
// accept canonical series content exclusively; historical aliases and fields
// are converted here before canonical validation.
function migrateLegacySeriesContent(content) {
    if (!Array.isArray(content)) return content;

    return content.map((block) => {
        if (!isObject(block)) return block;

        const migrated = {
            ...block,
            type: block.type === 'image' ? 'photo' : block.type
        };
        delete migrated.order;
        if (isObject(migrated.layout)) {
            migrated.layout = { ...migrated.layout };
            delete migrated.layout.gridVersion;
        }

        if (migrated.type === 'photos' && Array.isArray(migrated.content)) {
            const seen = new Set();
            migrated.content = migrated.content.reduce((items, item) => {
                const source = isObject(item) ? item : { id: item };
                const id = source.id ?? source.photoId ?? source.content;
                const numeric = numericId(id);
                if (numeric && seen.has(numeric)) return items;
                if (numeric) seen.add(numeric);

                const migratedItem = { ...source, id };
                delete migratedItem.photoId;
                delete migratedItem.content;
                if (isObject(migratedItem.layout)) {
                    migratedItem.layout = { ...migratedItem.layout };
                    delete migratedItem.layout.gridVersion;
                }
                items.push(migratedItem);
                return items;
            }, []);
        }

        return migrated;
    });
}

function numericId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function issue(code, message, context = {}) {
    return { code, message, ...context };
}

function assertMetadataCutoverReady(report) {
    const missingAssetInventories = Number(report?.counts?.missingAssetInventories || 0);
    if (missingAssetInventories > 0) {
        const error = new Error(
            'Preflight cutover fallito: '
            + `${missingAssetInventories} foto non hanno un inventario asset esplicito. `
            + 'Riconciliare gli oggetti R2 e ripetere la verifica prima di import o cutover.'
        );
        error.code = 'MISSING_ASSET_INVENTORIES_PREFLIGHT';
        error.details = { missingAssetInventories };
        throw error;
    }

    if (Array.isArray(report?.errors) && report.errors.length > 0) {
        const error = new Error(
            `Preflight cutover fallito: ${report.errors.length} errori di metadata ancora presenti.`
        );
        error.code = 'METADATA_CUTOVER_PREFLIGHT_FAILED';
        error.details = { errorCount: report.errors.length };
        throw error;
    }
}

function normalizeObjectNamespace(value) {
    return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}

function canonicalAssetIdentity(asset) {
    return {
        objectNamespace: normalizeObjectNamespace(asset.objectNamespace),
        photoId: Number(asset.photoId),
        generation: asset.generation || null,
        role: asset.role,
        replacementGroup: asset.replacementGroup,
        scope: asset.scope,
        path: asset.path,
        contentType: asset.contentType,
        state: asset.state || 'active',
        uploadIntentId: asset.uploadIntentId || null,
        mediaOperationId: asset.mediaOperationId || null
    };
}

function sortAssetInventory(assets) {
    return assets
        .map(canonicalAssetIdentity)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function inspectContentReferences(rawSeries, photoIds, membership, report) {
    const used = new Set();
    const blocks = Array.isArray(rawSeries.content) ? rawSeries.content : [];

    blocks.forEach((block, blockIndex) => {
        if (!isObject(block)) {
            report.errors.push(issue(
                'INVALID_CONTENT_BLOCK',
                'Il blocco non è un oggetto.',
                { seriesId: String(rawSeries.id), blockIndex }
            ));
            return;
        }

        if (block.type === 'image') {
            report.warnings.push(issue(
                'LEGACY_IMAGE_BLOCK',
                'Il tipo legacy "image" verrà normalizzato in "photo".',
                { seriesId: String(rawSeries.id), blockId: block.id }
            ));
        }
        if (Object.hasOwn(block, 'order')) {
            report.warnings.push(issue(
                'LEGACY_BLOCK_ORDER',
                'Il campo legacy order non è autorevole e verrà rimosso.',
                { seriesId: String(rawSeries.id), blockId: block.id }
            ));
        }
        if (isObject(block.layout) && Object.hasOwn(block.layout, 'gridVersion')) {
            report.warnings.push(issue(
                'LEGACY_GRID_VERSION',
                'gridVersion non è più parte del layout canonico.',
                { seriesId: String(rawSeries.id), blockId: block.id }
            ));
        }

        let type;
        try {
            type = normalizeBlockType(
                block.type === 'image' ? 'photo' : block.type,
                { field: `series[${rawSeries.id}].content[${blockIndex}].type` }
            );
        } catch (error) {
            report.errors.push(issue(
                'UNKNOWN_SERIES_BLOCK_TYPE',
                error.message,
                {
                    seriesId: String(rawSeries.id),
                    blockId: block.id,
                    blockIndex,
                    value: block.type
                }
            ));
            return;
        }
        if (type === 'photo') {
            const id = numericId(block.content);
            if (!id) {
                report.errors.push(issue(
                    'INVALID_PHOTO_BLOCK_REFERENCE',
                    'Il blocco photo non contiene un ID valido.',
                    { seriesId: String(rawSeries.id), blockId: block.id }
                ));
                return;
            }
            used.add(id);
            if (!photoIds.has(id)) {
                report.errors.push(issue(
                    'DANGLING_CONTENT_REFERENCE',
                    'Il blocco photo riferisce una foto inesistente.',
                    { seriesId: String(rawSeries.id), blockId: block.id, photoId: id }
                ));
            }
            if (!membership.has(id)) {
                report.errors.push(issue(
                    'CONTENT_OUTSIDE_MEMBERSHIP',
                    'Il blocco photo riferisce una foto fuori dalla membership.',
                    { seriesId: String(rawSeries.id), blockId: block.id, photoId: id }
                ));
            }
            return;
        }

        if (type !== 'photos') return;
        if (!Array.isArray(block.content)) {
            report.errors.push(issue(
                'INVALID_PHOTO_GROUP',
                'Il blocco photos non contiene un array.',
                { seriesId: String(rawSeries.id), blockId: block.id }
            ));
            return;
        }

        const groupSeen = new Set();
        block.content.forEach((item, itemIndex) => {
            if (!isObject(item)) {
                report.warnings.push(issue(
                    'LEGACY_SCALAR_GROUP_ITEM',
                    'L’elemento scalare del gruppo verrà normalizzato in { id }.',
                    {
                        seriesId: String(rawSeries.id),
                        blockId: block.id,
                        itemIndex
                    }
                ));
            }
            const id = numericId(isObject(item) ? item.id ?? item.photoId ?? item.content : item);
            if (!id) {
                report.errors.push(issue(
                    'INVALID_GROUP_REFERENCE',
                    'Un elemento del gruppo photos non contiene un ID valido.',
                    {
                        seriesId: String(rawSeries.id),
                        blockId: block.id,
                        itemIndex
                    }
                ));
                return;
            }
            if (isObject(item?.layout) && Object.hasOwn(item.layout, 'gridVersion')) {
                report.warnings.push(issue(
                    'LEGACY_GROUP_GRID_VERSION',
                    'gridVersion non è più parte del layout del gruppo.',
                    {
                        seriesId: String(rawSeries.id),
                        blockId: block.id,
                        photoId: id
                    }
                ));
            }
            if (groupSeen.has(id)) {
                report.warnings.push(issue(
                    'DUPLICATE_GROUP_REFERENCE',
                    'La stessa foto compare più volte nello stesso gruppo.',
                    { seriesId: String(rawSeries.id), blockId: block.id, photoId: id }
                ));
            }
            groupSeen.add(id);
            used.add(id);
            if (!photoIds.has(id)) {
                report.errors.push(issue(
                    'DANGLING_CONTENT_REFERENCE',
                    'Il gruppo photos riferisce una foto inesistente.',
                    { seriesId: String(rawSeries.id), blockId: block.id, photoId: id }
                ));
            }
            if (!membership.has(id)) {
                report.errors.push(issue(
                    'CONTENT_OUTSIDE_MEMBERSHIP',
                    'Il gruppo photos riferisce una foto fuori dalla membership.',
                    { seriesId: String(rawSeries.id), blockId: block.id, photoId: id }
                ));
            }
        });
    });

    const unusedMembers = [...membership].filter((id) => !used.has(id));
    if (blocks.length > 0 && unusedMembers.length > 0) {
        report.info.push(issue(
            'UNPLACED_MEMBER_PHOTOS',
            'Foto appartenenti alla serie non sono usate nel documento editoriale.',
            { seriesId: String(rawSeries.id), photoIds: unusedMembers }
        ));
    }
}

function analyzeMetadataSnapshot({ photos, series }) {
    const report = {
        errors: [],
        warnings: [],
        info: [],
        counts: {
            photos: Array.isArray(photos) ? photos.length : 0,
            series: Array.isArray(series) ? series.length : 0,
            memberships: 0,
            contentPhotoReferences: 0,
            assets: 0,
            missingAssetInventories: 0
        },
        normalized: {
            photos: [],
            series: []
        }
    };

    if (!Array.isArray(photos)) {
        report.errors.push(issue('INVALID_PHOTOS_ROOT', 'photos.json deve contenere un array.'));
    }
    if (!Array.isArray(series)) {
        report.errors.push(issue('INVALID_SERIES_ROOT', 'series.json deve contenere un array.'));
    }
    if (report.errors.length > 0) return report;

    const photoIds = new Set();
    photos.forEach((record, index) => {
        const id = numericId(record?.id);
        if (!id) {
            report.errors.push(issue(
                'INVALID_PHOTO_ID',
                'La foto non ha un ID numerico positivo.',
                { index, value: record?.id }
            ));
            return;
        }
        if (photoIds.has(id)) {
            report.errors.push(issue('DUPLICATE_PHOTO_ID', 'ID foto duplicato.', { photoId: id }));
            return;
        }
        photoIds.add(id);
        if (!Array.isArray(record.assets)) {
            report.counts.missingAssetInventories += 1;
            report.errors.push(issue(
                'MISSING_EXPLICIT_ASSET_INVENTORY',
                'La foto non contiene l’inventario canonico degli asset attivi.',
                { photoId: id }
            ));
            return;
        }
        if (!record.assets.some((asset) => (
            String(asset?.role || '').trim().toLowerCase() === 'full'
        ))) {
            report.errors.push(issue(
                'MISSING_CANONICAL_FULL_ASSET',
                'Lo snapshot canonico deve contenere la derivata full attiva.',
                { photoId: id }
            ));
            return;
        }
        let photo;
        try {
            photo = toRuntimePhoto(record);
        } catch (error) {
            report.errors.push(issue(
                'INVALID_PHOTO_ASSET_INVENTORY',
                error?.message || 'L’inventario asset della foto non è valido.',
                { photoId: id }
            ));
            return;
        }
        try {
            const validatedMetadata = sanitizePhotoPayload({
                title: photo.title,
                description: photo.description,
                date: photo.date,
                location: photo.location,
                lat: photo.lat,
                lng: photo.lng,
                camera: photo.camera,
                lens: photo.lens,
                settings: photo.settings,
                tags: photo.tags
            });
            photo = { ...photo, ...validatedMetadata };
        } catch (error) {
            report.errors.push(issue(
                'INVALID_PHOTO_METADATA',
                error?.message || 'I metadata della foto non sono validi.',
                { photoId: id, details: error?.details || null }
            ));
            return;
        }
        if (!photo.assets.some((asset) => asset.role === 'source')) {
            report.warnings.push(issue(
                'MISSING_SOURCE_ASSET_INVENTORY',
                'La foto non ha una source privata confermata nell’inventario.',
                { photoId: id }
            ));
        }
        if (!Number(record.updatedAt)) {
            report.info.push(issue(
                'MISSING_PHOTO_UPDATED_AT',
                'updatedAt verrà importato come 0; derivativesVersion resta autorevole per gli asset.',
                { photoId: id }
            ));
        }
        report.counts.assets += photo.assets.length;
        report.normalized.photos.push(photo);
    });

    const seriesIds = new Set();
    const titleOwners = new Map();
    const slugOwners = new Map();
    series.forEach((record, index) => {
        const id = numericId(record?.id);
        if (!id) {
            report.errors.push(issue(
                'INVALID_SERIES_ID',
                'La serie non ha un ID numerico positivo.',
                { index, value: record?.id }
            ));
            return;
        }
        if (seriesIds.has(id)) {
            report.errors.push(issue('DUPLICATE_SERIES_ID', 'ID serie duplicato.', { seriesId: String(id) }));
            return;
        }
        seriesIds.add(id);

        const titleKey = normalizeSeriesTitleKey(record.title);
        const slug = createSeriesSlug(record.slug || record.title);
        if (titleOwners.has(titleKey)) {
            report.errors.push(issue(
                'DUPLICATE_SERIES_TITLE',
                'Titolo serie duplicato dopo la normalizzazione.',
                { seriesIds: [titleOwners.get(titleKey), String(id)], titleKey }
            ));
        } else {
            titleOwners.set(titleKey, String(id));
        }
        if (slugOwners.has(slug)) {
            report.errors.push(issue(
                'DUPLICATE_SERIES_SLUG',
                'Slug serie duplicato.',
                { seriesIds: [slugOwners.get(slug), String(id)], slug }
            ));
        } else {
            slugOwners.set(slug, String(id));
        }

        const rawMembers = Array.isArray(record.photos) ? record.photos : [];
        const membership = new Set();
        rawMembers.forEach((value, position) => {
            const photoId = numericId(value);
            if (!photoId) {
                report.errors.push(issue(
                    'INVALID_MEMBERSHIP_REFERENCE',
                    'series.photos contiene un ID non valido.',
                    { seriesId: String(id), position, value }
                ));
                return;
            }
            if (membership.has(photoId)) {
                report.warnings.push(issue(
                    'DUPLICATE_MEMBERSHIP',
                    'La stessa foto compare più volte in series.photos.',
                    { seriesId: String(id), photoId }
                ));
            }
            membership.add(photoId);
            if (!photoIds.has(photoId)) {
                report.errors.push(issue(
                    'DANGLING_MEMBERSHIP',
                    'series.photos riferisce una foto inesistente.',
                    { seriesId: String(id), photoId }
                ));
            }
        });
        report.counts.memberships += membership.size;

        const coverId = record.coverImage === null || record.coverImage === undefined
            ? null
            : numericId(record.coverImage);
        if (record.coverImage !== null && record.coverImage !== undefined && !coverId) {
            report.errors.push(issue(
                'INVALID_COVER',
                'coverImage non è un ID valido.',
                { seriesId: String(id), value: record.coverImage }
            ));
        } else if (coverId && !photoIds.has(coverId)) {
            report.errors.push(issue(
                'DANGLING_COVER',
                'coverImage riferisce una foto inesistente.',
                { seriesId: String(id), photoId: coverId }
            ));
        } else if (coverId && !membership.has(coverId)) {
            report.errors.push(issue(
                'COVER_OUTSIDE_MEMBERSHIP',
                'coverImage non appartiene alla serie.',
                { seriesId: String(id), photoId: coverId }
            ));
        }

        inspectContentReferences(record, photoIds, membership, report);
        let normalized;
        try {
            normalized = normalizeSeriesRecord({
                ...record,
                content: migrateLegacySeriesContent(record.content)
            });
        } catch (error) {
            report.errors.push(issue(
                'INVALID_SERIES_CONTENT',
                error.message || 'Il contenuto della serie non è valido.',
                {
                    seriesId: String(id),
                    ...(error?.details ? { details: error.details } : {})
                }
            ));
            return;
        }
        report.counts.contentPhotoReferences += new Set(
            normalized.content.flatMap((block) => {
                if (block.type === 'photo') return [block.content];
                if (block.type === 'photos') return block.content.map((item) => item.id);
                return [];
            })
        ).size;
        report.normalized.series.push(normalized);
    });

    report.normalized.photos.sort((a, b) => a.id - b.id);
    report.normalized.series.sort((a, b) => Number(a.id) - Number(b.id));
    report.checksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(report.normalized))
        .digest('hex');
    return report;
}

async function importMetadataSnapshot(pool, snapshot, {
    dryRun = false,
    objectNamespace = ''
} = {}) {
    const report = analyzeMetadataSnapshot(snapshot);
    if (dryRun) {
        return {
            imported: false,
            dryRun,
            report
        };
    }
    // Keep the final staging/production import fail-closed even when callers
    // invoke the service directly instead of using the CLI wrapper.
    assertMetadataCutoverReady(report);

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const existing = await client.query(
            `SELECT
                (SELECT count(*)::int FROM photos) AS photos,
                (SELECT count(*)::int FROM series) AS series,
                (SELECT count(*)::int FROM series_photos) AS memberships,
                (SELECT count(*)::int FROM photo_assets) AS assets`
        );
        const existingCounts = existing.rows[0];
        if (
            existingCounts.photos
            || existingCounts.series
            || existingCounts.memberships
            || existingCounts.assets
        ) {
            const error = new Error(
                'Import rifiutato: il database target non è vuoto. Non vengono eseguiti upsert.'
            );
            error.code = 'IMPORT_TARGET_NOT_EMPTY';
            throw error;
        }

        for (const photo of report.normalized.photos) {
            await client.query(
                `INSERT INTO photos (
                    id, title, description, date_taken, location_name,
                    latitude, longitude, camera, lens, resolution, settings,
                    tags, updated_at_ms, derivatives_version, created_at, media_generation,
                    version
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
                    $12, $13, $14, COALESCE($15::timestamptz, CURRENT_TIMESTAMP), $16,
                    COALESCE($17, 1)
                 )`,
                [
                    photo.id,
                    photo.title,
                    photo.description,
                    photo.date,
                    photo.location,
                    photo.lat,
                    photo.lng,
                    photo.camera,
                    photo.lens,
                    photo.resolution,
                    JSON.stringify(photo.settings || {}),
                    photo.tags,
                    photo.updatedAt,
                    photo.derivativesVersion,
                    photo.createdAt || null,
                    photo.mediaGeneration || null,
                    Number.isSafeInteger(photo.version) && photo.version > 0
                        ? photo.version
                        : null
                ]
            );

            for (const asset of photo.assets) {
                await client.query(
                    `INSERT INTO photo_assets (
                        object_namespace, photo_id, generation, role, replacement_group,
                        storage_scope, logical_path, content_type, state,
                        stored_at, activated_at
                     ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, 'active',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                     )`,
                    [
                        normalizeObjectNamespace(objectNamespace),
                        photo.id,
                        asset.generation,
                        asset.role,
                        asset.replacementGroup,
                        asset.scope,
                        asset.path,
                        asset.contentType
                    ]
                );
            }
        }

        await client.query(
            `SELECT setval(
                'portfolio_photo_id_seq',
                GREATEST(
                    COALESCE((SELECT MAX(id) FROM photos), 0),
                    COALESCE((SELECT MAX(photo_id) FROM photo_creation_intents), 0),
                    1
                ),
                EXISTS (
                    SELECT 1 FROM photos
                    UNION ALL
                    SELECT 1 FROM photo_creation_intents
                )
            )`
        );

        for (const item of report.normalized.series) {
            await client.query(
                `INSERT INTO series (
                    id, title, title_key, slug, description, cover_photo_id,
                    content, published, created_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb, $7, $8, $9)`,
                [
                    item.id,
                    item.title,
                    normalizeSeriesTitleKey(item.title),
                    item.slug,
                    item.description,
                    JSON.stringify(item.content),
                    item.published,
                    item.createdAt,
                    item.updatedAt
                ]
            );
            for (let position = 0; position < item.photos.length; position += 1) {
                await client.query(
                    `INSERT INTO series_photos (series_id, photo_id, position)
                     VALUES ($1, $2, $3)`,
                    [item.id, item.photos[position], position]
                );
            }
            if (item.coverImage !== null) {
                await client.query(
                    'UPDATE series SET cover_photo_id = $2 WHERE id = $1',
                    [item.id, item.coverImage]
                );
            }
        }

        await client.query('COMMIT');
        return {
            imported: true,
            dryRun: false,
            report
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function verifyImportedSnapshot(pool, snapshot, {
    objectNamespace = ''
} = {}) {
    const report = analyzeMetadataSnapshot(snapshot);
    if (report.errors.length > 0) {
        return {
            valid: false,
            expected: report.counts,
            errors: report.errors
        };
    }
    const result = await pool.query(
        `SELECT
            (SELECT count(*)::int FROM photos) AS photos,
            (SELECT count(*)::int FROM series) AS series,
            (SELECT count(*)::int FROM series_photos) AS memberships,
            (SELECT count(*)::int FROM photo_assets) AS assets,
            (
                SELECT count(*)::int
                FROM series s
                LEFT JOIN series_photos sp
                    ON sp.series_id = s.id
                   AND sp.photo_id = s.cover_photo_id
                WHERE s.cover_photo_id IS NOT NULL
                  AND sp.photo_id IS NULL
            ) AS invalid_covers,
            (
                SELECT count(*)::int
                FROM series_photos sp
                LEFT JOIN photos p ON p.id = sp.photo_id
                WHERE p.id IS NULL
            ) AS dangling_memberships`
    );
    const actual = result.rows[0];
    const errors = [];
    for (const key of ['photos', 'series', 'memberships', 'assets']) {
        if (Number(actual[key]) !== Number(report.counts[key])) {
            errors.push(issue(
                'COUNT_MISMATCH',
                `Conteggio ${key} diverso dopo l'import.`,
                { key, expected: report.counts[key], actual: Number(actual[key]) }
            ));
        }
    }
    if (actual.invalid_covers) {
        errors.push(issue('INVALID_IMPORTED_COVER', 'Sono presenti copertine non appartenenti alla serie.'));
    }
    if (actual.dangling_memberships) {
        errors.push(issue('DANGLING_IMPORTED_MEMBERSHIP', 'Sono presenti membership dangling.'));
    }

    const expectedAssets = sortAssetInventory(
        report.normalized.photos.flatMap((photo) => photo.assets.map((asset) => ({
            ...asset,
            objectNamespace,
            photoId: photo.id,
            state: 'active'
        })))
    );
    const storedAssetsResult = await pool.query(
        `SELECT
            object_namespace, photo_id, generation, role, replacement_group,
            storage_scope, logical_path, content_type, state,
            owner_upload_intent_id, owner_media_operation_id
         FROM photo_assets`
    );
    const actualAssets = sortAssetInventory(storedAssetsResult.rows.map((row) => ({
        objectNamespace: row.object_namespace,
        photoId: row.photo_id,
        generation: row.generation,
        role: row.role,
        replacementGroup: row.replacement_group,
        scope: row.storage_scope,
        path: row.logical_path,
        contentType: row.content_type,
        state: row.state,
        uploadIntentId: row.owner_upload_intent_id,
        mediaOperationId: row.owner_media_operation_id
    })));
    if (JSON.stringify(actualAssets) !== JSON.stringify(expectedAssets)) {
        const expectedKeys = new Set(expectedAssets.map((asset) => JSON.stringify(asset)));
        const actualKeys = new Set(actualAssets.map((asset) => JSON.stringify(asset)));
        errors.push(issue(
            'ASSET_INVENTORY_MISMATCH',
            'L’inventario asset importato non coincide con lo snapshot canonico.',
            {
                missing: expectedAssets.filter((asset) => !actualKeys.has(JSON.stringify(asset))),
                unexpected: actualAssets.filter((asset) => !expectedKeys.has(JSON.stringify(asset)))
            }
        ));
    }

    const storedPhotoGenerations = await pool.query(
        `SELECT id, title, description, date_taken, location_name,
                latitude, longitude, camera, lens, resolution, settings, tags,
                updated_at_ms, derivatives_version, media_generation,
                created_at, version
         FROM photos
         ORDER BY id`
    );
    const expectedGenerationByPhoto = new Map(
        report.normalized.photos.map((photo) => [Number(photo.id), photo.mediaGeneration])
    );
    for (const row of storedPhotoGenerations.rows) {
        const photoId = Number(row.id);
        const expectedPhoto = report.normalized.photos.find(
            (photo) => Number(photo.id) === photoId
        );
        const expectedGeneration = expectedGenerationByPhoto.get(photoId);
        if (row.media_generation !== expectedGeneration) {
            errors.push(issue(
                'PHOTO_MEDIA_GENERATION_MISMATCH',
                'La mediaGeneration importata non coincide con lo snapshot.',
                {
                    photoId,
                    expected: expectedGeneration || null,
                    actual: row.media_generation || null
                }
            ));
            continue;
        }
        const expectedMetadata = {
            title: expectedPhoto.title,
            description: expectedPhoto.description,
            date: expectedPhoto.date,
            location: expectedPhoto.location,
            lat: expectedPhoto.lat,
            lng: expectedPhoto.lng,
            camera: expectedPhoto.camera,
            lens: expectedPhoto.lens,
            resolution: expectedPhoto.resolution,
            settings: expectedPhoto.settings,
            tags: expectedPhoto.tags,
            updatedAt: expectedPhoto.updatedAt,
            derivativesVersion: expectedPhoto.derivativesVersion
        };
        const actualMetadata = {
            title: row.title,
            description: row.description,
            date: row.date_taken,
            location: row.location_name,
            lat: row.latitude === null ? null : Number(row.latitude),
            lng: row.longitude === null ? null : Number(row.longitude),
            camera: row.camera,
            lens: row.lens,
            resolution: row.resolution,
            settings: row.settings || {},
            tags: row.tags || [],
            updatedAt: Number(row.updated_at_ms),
            derivativesVersion: Number(row.derivatives_version)
        };
        if (!isDeepStrictEqual(actualMetadata, expectedMetadata)) {
            errors.push(issue(
                'PHOTO_METADATA_MISMATCH',
                'I metadata della foto importata non coincidono con lo snapshot.',
                { photoId, expected: expectedMetadata, actual: actualMetadata }
            ));
        }
        if (
            expectedPhoto.createdAt
            && new Date(row.created_at).toISOString() !== new Date(expectedPhoto.createdAt).toISOString()
        ) {
            errors.push(issue(
                'PHOTO_CREATED_AT_MISMATCH',
                'createdAt della foto importata non coincide con lo snapshot.',
                { photoId, expected: expectedPhoto.createdAt, actual: row.created_at }
            ));
        }
        if (
            Number.isSafeInteger(expectedPhoto.version)
            && expectedPhoto.version > 0
            && Number(row.version) !== expectedPhoto.version
        ) {
            errors.push(issue(
                'PHOTO_VERSION_MISMATCH',
                'La versione della foto importata non coincide con lo snapshot.',
                { photoId, expected: expectedPhoto.version, actual: Number(row.version) }
            ));
        }
        try {
            normalizePublishedPhotoAssetInventory(
                actualAssets
                    .filter((asset) => asset.photoId === photoId)
                    .map((asset) => ({
                        role: asset.role,
                        replacementGroup: asset.replacementGroup,
                        scope: asset.scope,
                        path: asset.path,
                        contentType: asset.contentType,
                        generation: asset.generation,
                        state: asset.state
                    })),
                {
                    photoId,
                    mediaGeneration: row.media_generation
                }
            );
        } catch (error) {
            errors.push(issue(
                'INVALID_IMPORTED_ASSET_INVENTORY',
                error?.message || 'L’inventario importato non è semanticamente valido.',
                { photoId }
            ));
        }
    }

    const storedSeries = await pool.query(
        `SELECT s.id, s.content, array_agg(sp.photo_id ORDER BY sp.position)
            FILTER (WHERE sp.photo_id IS NOT NULL) AS photo_ids
         FROM series s
         LEFT JOIN series_photos sp ON sp.series_id = s.id
         GROUP BY s.id, s.content`
    );
    for (const row of storedSeries.rows) {
        const membership = new Set((row.photo_ids || []).map(Number));
        const referenced = [];
        for (const block of row.content || []) {
            if (block?.type === 'photo') referenced.push(Number(block.content));
            if (block?.type === 'photos' && Array.isArray(block.content)) {
                for (const item of block.content) {
                    referenced.push(Number(
                        item && typeof item === 'object'
                            ? item.id ?? item.photoId ?? item.content
                            : item
                    ));
                }
            }
        }
        const invalidIds = [...new Set(referenced)]
            .filter((photoId) => !membership.has(photoId));
        if (invalidIds.length > 0) {
            errors.push(issue(
                'DANGLING_IMPORTED_CONTENT',
                'Il JSONB importato contiene riferimenti fuori dalla membership.',
                { seriesId: String(row.id), photoIds: invalidIds }
            ));
        }
    }
    return {
        valid: errors.length === 0,
        expected: report.counts,
        actual: {
            photos: Number(actual.photos),
            series: Number(actual.series),
            memberships: Number(actual.memberships),
            assets: Number(actual.assets),
            invalidCovers: Number(actual.invalid_covers),
            danglingMemberships: Number(actual.dangling_memberships)
        },
        errors
    };
}

module.exports = {
    analyzeMetadataSnapshot,
    assertMetadataCutoverReady,
    importMetadataSnapshot,
    migrateLegacySeriesContent,
    verifyImportedSnapshot
};
