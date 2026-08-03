const {
    enqueueMediaCleanupJobs
} = require('./PostgresMediaCleanupRepository');
const {
    normalizePhotoAssetReplacementGroup
} = require('../services/photoAssetLifecycle');

function mapPhotoAssetRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        photoId: Number(row.photo_id),
        generation: row.generation || null,
        role: row.role,
        replacementGroup: row.replacement_group,
        scope: row.storage_scope,
        path: row.logical_path,
        contentType: row.content_type,
        state: row.state,
        storedAt: row.stored_at ? new Date(row.stored_at).toISOString() : null,
        uploadIntentId: row.owner_upload_intent_id
            ? String(row.owner_upload_intent_id)
            : null,
        mediaOperationId: row.owner_media_operation_id
            ? String(row.owner_media_operation_id)
            : null
    };
}

function normalizeAssetDescriptor(asset) {
    const role = String(asset?.role || '').trim().toLowerCase();
    const scope = String(asset?.scope || '').trim().toLowerCase();
    const path = String(asset?.path || '').trim();
    const contentType = String(asset?.contentType || '').trim().toLowerCase();
    const replacementGroup = normalizePhotoAssetReplacementGroup(
        asset?.replacementGroup
    );
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(role)) {
        throw new TypeError('Ruolo asset non valido.');
    }
    if (!['public', 'private'].includes(scope)) {
        throw new TypeError('Scope asset non valido.');
    }
    const expectedPrefix = scope === 'public' ? '/uploads/' : '/private/';
    if (!path.startsWith(expectedPrefix) || path.includes('..') || path.includes('\\')) {
        throw new TypeError('Path asset non valido.');
    }
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(contentType)) {
        throw new TypeError('Content-Type asset non valido.');
    }
    return { role, replacementGroup, scope, path, contentType };
}

async function registerPlannedPhotoAssets(queryable, {
    namespace,
    photoId,
    generation = null,
    assets,
    uploadIntentId = null,
    mediaOperationId = null,
    cleanupReason,
    availableAt
}) {
    const registered = [];
    for (const rawAsset of Array.isArray(assets) ? assets : []) {
        const asset = normalizeAssetDescriptor(rawAsset);
        const result = await queryable.query(
            `INSERT INTO photo_assets (
                object_namespace, photo_id, generation, role, replacement_group,
                storage_scope,
                logical_path, content_type, state, owner_upload_intent_id,
                owner_media_operation_id
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'planned', $9::uuid, $10::uuid
             )
             ON CONFLICT (object_namespace, storage_scope, logical_path)
             DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                namespace,
                photoId,
                generation,
                asset.role,
                asset.replacementGroup,
                asset.scope,
                asset.path,
                asset.contentType,
                uploadIntentId,
                mediaOperationId
            ]
        );
        const stored = mapPhotoAssetRow(result.rows[0]);
        if (
            stored.photoId !== Number(photoId)
            || stored.role !== asset.role
            || stored.replacementGroup !== asset.replacementGroup
            || stored.generation !== generation
            || stored.uploadIntentId !== uploadIntentId
            || stored.mediaOperationId !== mediaOperationId
        ) {
            throw new Error(`Il path ${asset.path} appartiene già a un altro asset.`);
        }
        registered.push(stored);
    }
    await enqueueMediaCleanupJobs(
        queryable,
        registered.map((asset) => ({
            assetId: asset.id,
            namespace,
            ownerKey: `asset:${asset.id}`,
            reason: cleanupReason,
            availableAt
        }))
    );
    return registered;
}

async function markPhotoAssetsStored(queryable, assetIds) {
    const ids = (Array.isArray(assetIds) ? assetIds : []).map(Number);
    if (!ids.length) return [];
    const result = await queryable.query(
        `UPDATE photo_assets
         SET stored_at = COALESCE(stored_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::bigint[])
         RETURNING *`,
        [ids]
    );
    return result.rows.map(mapPhotoAssetRow);
}

async function importActivePhotoAssets(queryable, {
    namespace,
    photoId,
    generation,
    assets
}) {
    const imported = [];
    for (const rawAsset of Array.isArray(assets) ? assets : []) {
        const asset = normalizeAssetDescriptor(rawAsset);
        const result = await queryable.query(
            `INSERT INTO photo_assets (
                object_namespace, photo_id, generation, role, replacement_group,
                storage_scope,
                logical_path, content_type, state, stored_at, activated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'active',
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             )
             ON CONFLICT (object_namespace, storage_scope, logical_path)
             DO NOTHING
             RETURNING *`,
            [
                namespace,
                photoId,
                generation,
                asset.role,
                asset.replacementGroup,
                asset.scope,
                asset.path,
                asset.contentType
            ]
        );
        if (result.rows[0]) imported.push(mapPhotoAssetRow(result.rows[0]));
    }
    return imported;
}

async function activatePhotoAssets(queryable, {
    namespace,
    photoId,
    generation,
    uploadIntentId = null,
    mediaOperationId = null,
    replacedReason
}) {
    const ownerColumn = uploadIntentId
        ? 'owner_upload_intent_id'
        : 'owner_media_operation_id';
    const ownerValue = uploadIntentId || mediaOperationId;
    const plannedResult = await queryable.query(
        `SELECT *
         FROM photo_assets
         WHERE object_namespace = $1
           AND photo_id = $2
           AND generation = $3
           AND ${ownerColumn} = $4::uuid
           AND state = 'planned'
         ORDER BY id
         FOR UPDATE`,
        [namespace, photoId, generation, ownerValue]
    );
    const planned = plannedResult.rows.map(mapPhotoAssetRow);
    if (!planned.length) {
        throw new Error('Nessun asset registrato per la generazione da pubblicare.');
    }
    const unstored = planned.filter((asset) => !asset.storedAt);
    if (unstored.length) {
        throw new Error(
            `La generazione contiene asset non confermati nello storage: ${unstored
                .map((asset) => asset.role)
                .join(', ')}.`
        );
    }
    const replacementGroups = [...new Set(
        planned.map((asset) => asset.replacementGroup)
    )];
    const retiredResult = await queryable.query(
        `UPDATE photo_assets
         SET state = 'retired',
             retired_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE object_namespace = $1
           AND photo_id = $2
           AND replacement_group = ANY($3::varchar[])
           AND state = 'active'
         RETURNING *`,
        [namespace, photoId, replacementGroups]
    );
    const retired = retiredResult.rows.map(mapPhotoAssetRow);
    await enqueueMediaCleanupJobs(
        queryable,
        retired.map((asset) => ({
            assetId: asset.id,
            namespace,
            ownerKey: `asset:${asset.id}`,
            reason: replacedReason,
            availableAt: new Date()
        }))
    );
    const activatedResult = await queryable.query(
        `UPDATE photo_assets
         SET state = 'active',
             activated_at = CURRENT_TIMESTAMP,
             retired_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::bigint[])
         RETURNING *`,
        [planned.map((asset) => asset.id)]
    );
    await queryable.query(
        `UPDATE media_cleanup_jobs
         SET status = 'cancelled',
             lease_id = NULL,
             lease_expires_at = NULL,
             last_error_code = 'ACTIVE_ASSET_PROTECTED',
             last_error_message = 'L’asset è diventato attivo.',
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE asset_id = ANY($1::bigint[])
           AND status IN ('pending', 'processing')`,
        [planned.map((asset) => asset.id)]
    );
    return activatedResult.rows.map(mapPhotoAssetRow);
}

async function retireAllActivePhotoAssets(queryable, {
    namespace,
    photoId,
    reason
}) {
    const result = await queryable.query(
        `UPDATE photo_assets
         SET state = 'retired',
             retired_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE object_namespace = $1
           AND photo_id = $2
           AND state = 'active'
         RETURNING *`,
        [namespace, photoId]
    );
    const assets = result.rows.map(mapPhotoAssetRow);
    await enqueueMediaCleanupJobs(
        queryable,
        assets.map((asset) => ({
            assetId: asset.id,
            namespace,
            ownerKey: `asset:${asset.id}`,
            reason,
            availableAt: new Date()
        }))
    );
    return assets;
}

async function loadActivePhotoAssets(queryable, namespace, photoIds) {
    const ids = [...new Set((Array.isArray(photoIds) ? photoIds : [photoIds])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return new Map();
    const result = await queryable.query(
        `SELECT *
         FROM photo_assets
         WHERE object_namespace = $1
           AND photo_id = ANY($2::bigint[])
           AND state = 'active'
         ORDER BY photo_id, role`,
        [namespace, ids]
    );
    const byPhoto = new Map(ids.map((id) => [id, []]));
    for (const row of result.rows) {
        byPhoto.get(Number(row.photo_id))?.push(mapPhotoAssetRow(row));
    }
    return byPhoto;
}

module.exports = {
    activatePhotoAssets,
    importActivePhotoAssets,
    loadActivePhotoAssets,
    mapPhotoAssetRow,
    markPhotoAssetsStored,
    registerPlannedPhotoAssets,
    retireAllActivePhotoAssets
};
