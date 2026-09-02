const crypto = require('node:crypto');
const {
    buildPhotoCreationSourcePath,
    materializePhotoAssets,
    PHOTO_ASSET_REPLACEMENT_GROUPS
} = require('./photoDerivatives');
const { PRIVATE_SOURCE_PREFIX } = require('../config/assetPaths');
const DEFAULTS = require('../config/defaults');
const {
    validateUploadedPhotoSourceObject
} = require('./photoUploadPolicy');

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, stableJsonValue(value[key])])
    );
}

function buildPhotoCreationPayloadHash(payload) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(stableJsonValue(payload)))
        .digest('hex');
}

function createPhotoCreationError(message, status, code, details) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    if (details !== undefined) error.details = details;
    return error;
}

class PhotoCreationService {
    constructor({
        repository,
        createSignedUploadUrl,
        readSourceObject,
        generateDerivatives,
        writeAssets,
        validateSourceObject = validateUploadedPhotoSourceObject,
        createMediaGeneration,
        runCleanup = async () => null,
        createOperationId = () => crypto.randomUUID(),
        now = () => Date.now(),
        intentTtlMs = DEFAULTS.photoCreationIntentTtlMs,
        leaseTtlMs = DEFAULTS.photoCreationLeaseTtlMs
    }) {
        if (!repository?.capabilities?.distributedPhotoCreations || !repository.photoCreations) {
            throw createPhotoCreationError(
                'La creazione idempotente richiede lo storage transazionale Postgres.',
                503,
                'TRANSACTIONAL_PHOTO_CREATION_REQUIRED'
            );
        }
        this.repository = repository;
        this.createSignedUploadUrl = createSignedUploadUrl;
        this.readSourceObject = readSourceObject;
        this.generateDerivatives = generateDerivatives;
        this.writeAssets = writeAssets;
        this.validateSourceObject = validateSourceObject;
        this.createMediaGeneration = createMediaGeneration;
        this.runCleanup = runCleanup;
        this.createOperationId = createOperationId;
        this.now = now;
        this.intentTtlMs = intentTtlMs;
        this.leaseTtlMs = leaseTtlMs;
    }

    async runCleanupBestEffort(uploadIntentId) {
        try {
            return await this.runCleanup({ limit: 10 });
        } catch (error) {
            console.warn('[photo_creation_cleanup_executor_failed]', {
                uploadIntentId,
                code: error?.code || null,
                message: error?.message
            });
            return null;
        }
    }

    async prepareUpload({
        uploadIntentId,
        sourceContentType,
        sourceExtension,
        signedUrlOptions
    }) {
        const sourcePath = buildPhotoCreationSourcePath(
            uploadIntentId,
            sourceExtension
        );
        const intent = await this.repository.photoCreations.createOrGet({
            id: uploadIntentId,
            sourcePath,
            sourceContentType,
            ttlMs: this.intentTtlMs
        });
        const signed = await this.createSignedUploadUrl(
            intent.sourcePath,
            signedUrlOptions
        );
        return {
            uploadIntentId: intent.id,
            photoId: intent.photoId,
            uploadUrl: signed.uploadUrl,
            sourcePath: intent.sourcePath,
            contentType: intent.sourceContentType,
            expiresInSeconds: signed.expiresInSeconds
        };
    }

    async finalize({
        uploadIntentId,
        photoId,
        sourcePath,
        photoDraft
    }) {
        const normalizedSourcePath = String(sourcePath || '').trim();
        const expectedSourcePrefix = `${PRIVATE_SOURCE_PREFIX}/photo-creation-intents/${String(uploadIntentId).toLowerCase()}/`;
        if (!normalizedSourcePath.startsWith(expectedSourcePrefix)) {
            throw createPhotoCreationError(
                'sourcePath non valido per la prenotazione richiesta.',
                400,
                'INVALID_SOURCE_PATH'
            );
        }
        const payloadHash = buildPhotoCreationPayloadHash({
            uploadIntentId,
            photoId,
            sourcePath: normalizedSourcePath,
            photo: photoDraft
        });
        const leaseId = this.createOperationId();
        const outputGeneration = this.createMediaGeneration();
        const claim = await this.repository.photoCreations.claim(uploadIntentId, {
            leaseId,
            photoId,
            generation: outputGeneration,
            sourcePath: normalizedSourcePath,
            payloadHash,
            leaseTtlMs: this.leaseTtlMs
        });
        if (!claim) {
            throw createPhotoCreationError(
                'Prenotazione upload non trovata. Ripeti il caricamento del file.',
                404,
                'PHOTO_UPLOAD_INTENT_NOT_FOUND'
            );
        }
        if (claim.status === 'completed') {
            return {
                photo: claim.photo,
                replayed: true
            };
        }

        try {
            const sourceObject = await this.readSourceObject(normalizedSourcePath);
            if (!sourceObject?.buffer) {
                throw createPhotoCreationError(
                    'File originale non trovato: ripeti il caricamento sulla stessa prenotazione.',
                    400,
                    'PHOTO_SOURCE_NOT_FOUND'
                );
            }
            const validatedSource = await this.validateSourceObject(sourceObject, {
                expectedContentType: claim.intent.sourceContentType
            });
            const derivatives = await this.generateDerivatives(
                validatedSource.buffer,
                photoDraft.settings?.cropProfiles
            );
            const assets = materializePhotoAssets(
                claim.intent.photoId,
                claim.intent.leaseGeneration,
                [
                    {
                        role: 'source',
                        replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE,
                        scope: 'private',
                        fileName: `source.${validatedSource.extension}`,
                        contentType: validatedSource.contentType,
                        buffer: validatedSource.buffer
                    },
                    ...derivatives.assets
                ]
            );
            const registeredAssets = await this.repository.photoCreations.registerOutputAssets(
                uploadIntentId,
                leaseId,
                assets
            );
            await this.writeAssets(assets);
            await this.repository.photoCreations.markOutputAssetsStored(
                uploadIntentId,
                leaseId,
                registeredAssets.map((asset) => asset.id)
            );

            const timestamp = this.now();
            const finalized = await this.repository.photoCreations.finalize(
                uploadIntentId,
                leaseId,
                {
                    ...photoDraft,
                    id: claim.intent.photoId,
                    resolution: derivatives.resolution,
                    mediaGeneration: claim.intent.leaseGeneration,
                    updatedAt: timestamp,
                    derivativesVersion: timestamp
                },
                { payloadHash }
            );
            if (!finalized?.photo) {
                throw createPhotoCreationError(
                    'Prenotazione upload non più disponibile.',
                    409,
                    'PHOTO_UPLOAD_INTENT_STALE'
                );
            }
            await this.runCleanupBestEffort(uploadIntentId);
            return finalized;
        } catch (error) {
            try {
                await this.repository.photoCreations.release(uploadIntentId, leaseId);
            } catch (releaseError) {
                console.warn('[photo_creation_lease_release_failed]', {
                    uploadIntentId,
                    leaseId,
                    message: releaseError?.message
                });
            }
            await this.runCleanupBestEffort(uploadIntentId);
            throw error;
        }
    }
}

module.exports = {
    PhotoCreationService,
    buildPhotoCreationPayloadHash
};
