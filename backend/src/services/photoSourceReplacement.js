const crypto = require('crypto');
const DEFAULTS = require('../config/defaults');
const {
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    materializePhotoAssets,
    normalizeMediaGeneration,
    normalizePrivateSourcePathForPhotoId,
    PHOTO_ASSET_REPLACEMENT_GROUPS
} = require('./photoDerivatives');
const { validateDeclaredPhotoUpload, validateUploadedPhotoSourceObject } = require('./photoUploadPolicy');
const { createMediaGeneration } = require('../utils/mediaGeneration');
require('../contracts/photoMetadataOperations');

function createServiceError(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

class PhotoSourceReplacementService {
    constructor({
        repository,
        createSignedUploadUrl,
        readSourceObject,
        writeAssets,
        runCleanup,
        generateDerivatives = generatePhotoDerivatives,
        validateSourceObject = validateUploadedPhotoSourceObject,
        createGeneration = createMediaGeneration,
        createOperationId = () => crypto.randomUUID(),
        mutationTtlMs = DEFAULTS.photoMediaMutationTtlMs,
        signedUrlExpiresSeconds = DEFAULTS.r2SignedUploadUrlExpiresSeconds
    }) {
        this.repository = repository;
        this.createSignedUploadUrl = createSignedUploadUrl;
        this.readSourceObject = readSourceObject;
        this.writeAssets = writeAssets;
        this.runCleanup = runCleanup;
        this.generateDerivatives = generateDerivatives;
        this.validateSourceObject = validateSourceObject;
        this.createGeneration = createGeneration;
        this.createOperationId = createOperationId;
        this.mutationTtlMs = mutationTtlMs;
        this.signedUrlExpiresSeconds = signedUrlExpiresSeconds;
    }

    async abortBestEffort(photoId, operationId) {
        if (!photoId || !operationId) return;
        try {
            await this.repository.photos.abortMediaMutation(photoId, operationId);
            await this.runCleanup?.({ limit: 10 });
        } catch (error) {
            console.warn('[photo_media_abort_failed]', {
                photoId,
                operationId,
                message: error?.message
            });
        }
    }

    async prepare({ photoId, expectedVersion, contentType, fileSize }) {
        let operationId = null;
        try {
            const declaration = validateDeclaredPhotoUpload({ contentType, fileSize });
            const generation = this.createGeneration();
            operationId = this.createOperationId();
            const reservation = await this.repository.photos.beginMediaMutation(photoId, {
                operationId,
                generation,
                kind: 'replace-source',
                expectedVersion,
                ttlMs: this.mutationTtlMs
            });
            if (!reservation) return null;

            const [sourceAsset] = materializePhotoAssets(photoId, generation, [{
                role: 'source',
                replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE,
                scope: 'private',
                fileName: `source.${declaration.extension}`,
                contentType: declaration.contentType
            }]);
            await this.repository.photos.registerMediaMutationAssets(
                photoId,
                operationId,
                [sourceAsset]
            );
            const signed = await this.createSignedUploadUrl(sourceAsset.path, {
                contentType: declaration.contentType,
                cacheControl: 'private, no-store',
                expiresInSeconds: this.signedUrlExpiresSeconds
            });

            return {
                uploadUrl: signed.uploadUrl,
                sourcePath: signed.uploadPath,
                contentType: declaration.contentType,
                operationId,
                mediaGeneration: generation,
                expectedVersion,
                expiresInSeconds: signed.expiresInSeconds
            };
        } catch (error) {
            await this.abortBestEffort(photoId, operationId);
            throw error;
        }
    }

    async abort(photoId, operationId) {
        const result = await this.repository.photos.abortMediaMutation(photoId, operationId);
        const cleanup = await this.runCleanup?.({ limit: 10 });
        return { result, cleanup };
    }

    async finalize({
        photoId,
        expectedVersion,
        operationId,
        mediaGeneration,
        sourcePath,
        onStage
    }) {
        const generation = normalizeMediaGeneration(mediaGeneration);
        const normalizedSourcePath = normalizePrivateSourcePathForPhotoId(sourcePath, photoId);
        if (!operationId || !generation || !normalizedSourcePath) {
            throw createServiceError(
                'Prenotazione reupload non valida o incompleta.',
                400,
                'INVALID_MEDIA_OPERATION'
            );
        }

        let finalized = false;
        try {
            const active = await this.repository.photos.getMediaMutation(photoId);
            if (
                !active?.operation
                || active.operation.id !== operationId
                || active.operation.generation !== generation
                || active.operation.kind !== 'replace-source'
                || !normalizedSourcePath.includes(`/${generation}/`)
            ) {
                throw createServiceError(
                    'La prenotazione del reupload non è più valida.',
                    409,
                    'MEDIA_OPERATION_STALE'
                );
            }
            const reservedSourceAsset = (active.assets || []).find((asset) => (
                asset.role === 'source'
                && asset.path === normalizedSourcePath
                && asset.generation === generation
            ));
            if (!reservedSourceAsset) {
                throw createServiceError(
                    'La source non appartiene alla prenotazione attiva.',
                    409,
                    'MEDIA_OPERATION_SOURCE_MISMATCH'
                );
            }

            const sourceObject = await this.readSourceObject(normalizedSourcePath);
            onStage?.('read_private_source');
            if (!sourceObject) {
                throw createServiceError(
                    'Source privata non trovata nello storage.',
                    404,
                    'PHOTO_SOURCE_NOT_FOUND'
                );
            }
            const validatedSource = await this.validateSourceObject(sourceObject, {
                expectedContentType: reservedSourceAsset.contentType
            });
            onStage?.('validate_private_source');

            const derivatives = await this.generateDerivatives(
                validatedSource.buffer,
                getCropProfilesFromSettings(active.photo.settings)
            );
            onStage?.('generate_derivatives');
            const nextAssets = materializePhotoAssets(photoId, generation, derivatives.assets);
            await this.repository.photos.registerMediaMutationAssets(
                photoId,
                operationId,
                nextAssets
            );
            await this.writeAssets(nextAssets);
            await this.repository.photos.markMediaMutationAssetsStored(photoId, operationId);
            onStage?.('write_public_derivatives');

            const updatedPhoto = await this.repository.photos.completeMediaMutation(
                photoId,
                operationId,
                {
                    resolution: derivatives.resolution,
                    mediaGeneration: generation,
                    updatedAt: Date.now(),
                    derivativesVersion: Date.now()
                },
                { expectedVersion }
            );
            finalized = true;
            onStage?.('commit_photo_generation');
            await this.runCleanup?.({ limit: 10 });
            return updatedPhoto;
        } finally {
            if (!finalized) {
                await this.abortBestEffort(photoId, operationId);
            }
        }
    }
}

module.exports = { PhotoSourceReplacementService };
