const crypto = require('node:crypto');
const { toRuntimePhoto } = require('./photoRecord');
const {
    createSeriesSlug,
    normalizeSeriesRecord,
    normalizeSeriesTitleKey
} = require('./seriesRecord');

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numericId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function issue(code, message, context = {}) {
    return { code, message, ...context };
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

        const type = block.type === 'image' ? 'photo' : block.type;
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
            contentPhotoReferences: 0
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
        const photo = toRuntimePhoto(record);
        if (!photo.sourcePath) {
            report.warnings.push(issue(
                'MISSING_SOURCE_PATH',
                'La foto non ha una source privata associata.',
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
        const normalized = normalizeSeriesRecord(record);
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

async function importMetadataSnapshot(pool, snapshot, { dryRun = false } = {}) {
    const report = analyzeMetadataSnapshot(snapshot);
    if (report.errors.length > 0 || dryRun) {
        return {
            imported: false,
            dryRun,
            report
        };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const existing = await client.query(
            `SELECT
                (SELECT count(*)::int FROM photos) AS photos,
                (SELECT count(*)::int FROM series) AS series,
                (SELECT count(*)::int FROM series_photos) AS memberships`
        );
        const existingCounts = existing.rows[0];
        if (existingCounts.photos || existingCounts.series || existingCounts.memberships) {
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
                    tags, source_path, source_content_type, mobile_image,
                    updated_at_ms, derivatives_version, created_at, media_generation
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
                    $12, $13, $14, $15, $16, $17, $18, $19
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
                    photo.sourcePath,
                    photo.sourceContentType,
                    photo.mobileImage,
                    photo.updatedAt,
                    photo.derivativesVersion,
                    new Date(photo.id).toISOString(),
                    photo.mediaGeneration || null
                ]
            );
        }

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

async function verifyImportedSnapshot(pool, snapshot) {
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
    for (const key of ['photos', 'series', 'memberships']) {
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
            invalidCovers: Number(actual.invalid_covers),
            danglingMemberships: Number(actual.dangling_memberships)
        },
        errors
    };
}

module.exports = {
    analyzeMetadataSnapshot,
    importMetadataSnapshot,
    verifyImportedSnapshot
};
