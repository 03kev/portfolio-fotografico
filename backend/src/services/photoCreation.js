const crypto = require('node:crypto');
const {
    buildPhotoCreationSourcePath,
    buildPhotoAssetPaths
} = require('./photoDerivatives');
const { PRIVATE_SOURCE_PREFIX } = require('../config/assetPaths');
const DEFAULTS = require('../config/defaults');

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
        writeSourceObject,
        generateDerivatives,
        writeDerivatives,
        createMediaGeneration,
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
        this.writeSourceObject = writeSourceObject;
        this.generateDerivatives = generateDerivatives;
        this.writeDerivatives = writeDerivatives;
        this.createMediaGeneration = createMediaGeneration;
        this.createOperationId = createOperationId;
        this.now = now;
        this.intentTtlMs = intentTtlMs;
        this.leaseTtlMs = leaseTtlMs;
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
            const derivatives = await this.generateDerivatives(
                sourceObject.buffer,
                photoDraft.settings?.cropProfiles
            );
            const sourceExtension = String(claim.intent.sourceContentType || '')
                .split('/')
                .pop()
                ?.replace(/^jpeg$/i, 'jpg')
                ?.replace(/[^a-z0-9]/gi, '')
                || 'bin';
            const assets = buildPhotoAssetPaths(
                claim.intent.photoId,
                sourceExtension,
                claim.intent.leaseGeneration
            );
            await this.writeSourceObject(
                assets.sourcePath,
                sourceObject.buffer,
                claim.intent.sourceContentType
            );
            await this.writeDerivatives(assets, derivatives);

            const timestamp = this.now();
            const finalized = await this.repository.photoCreations.finalize(
                uploadIntentId,
                leaseId,
                {
                    ...photoDraft,
                    id: claim.intent.photoId,
                    sourcePath: assets.sourcePath,
                    sourceContentType: claim.intent.sourceContentType,
                    resolution: derivatives.resolution,
                    mobileImage: true,
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
            throw error;
        }
    }
}

module.exports = {
    PhotoCreationService,
    buildPhotoCreationPayloadHash
};
