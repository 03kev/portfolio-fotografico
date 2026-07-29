const Series = require('../models/Series');
const { toRuntimePhoto, toStoragePhoto } = require('../services/photoRecord');
const {
    removePhotoReferencesFromSeriesRecord
} = require('../services/seriesPhotoReferences');
const {
    assertUniqueSeriesIdentity,
    createSeriesSlug,
    normalizeSeriesCollection,
    normalizeSeriesRecord,
    normalizeSeriesTitleKey
} = require('../services/seriesRecord');
const { MediaMutationConflictError, RepositoryConflictError } = require('./errors');

const PHOTOS_METADATA_FILE = 'photos.json';
const SERIES_METADATA_FILE = 'series.json';

function normalizePhotoId(value) {
    const photoId = Number(value);
    return Number.isSafeInteger(photoId) && photoId > 0 ? photoId : null;
}

class JsonPhotoRepository {
    constructor(metadataStorage) {
        this.metadataStorage = metadataStorage;
        this.mediaOperations = new Map();
    }

    async list() {
        const records = await this.metadataStorage.readMetadataFile(PHOTOS_METADATA_FILE, []);
        return Array.isArray(records)
            ? records.map((photo) => toRuntimePhoto(photo))
            : [];
    }

    async findById(id) {
        const photoId = normalizePhotoId(id);
        if (!photoId) return null;
        const photos = await this.list();
        return photos.find((photo) => Number(photo.id) === photoId) || null;
    }

    async create(photo, _options = {}) {
        const photoId = normalizePhotoId(photo?.id);
        if (!photoId) {
            throw new TypeError('La foto deve avere un ID numerico positivo.');
        }

        const photos = await this.list();
        if (photos.some((item) => Number(item.id) === photoId)) {
            return null;
        }

        const createdPhoto = {
            ...photo,
            id: photoId
        };
        photos.unshift(createdPhoto);
        await this.#writeAll(photos);
        return createdPhoto;
    }

    async updateById(id, changes, _options = {}) {
        const photoId = normalizePhotoId(id);
        if (!photoId) return null;

        const photos = await this.list();
        const index = photos.findIndex((photo) => Number(photo.id) === photoId);
        if (index === -1) return null;

        const updatedPhoto = {
            ...photos[index],
            ...changes,
            id: photos[index].id
        };
        photos[index] = updatedPhoto;
        await this.#writeAll(photos);
        return updatedPhoto;
    }

    async deleteById(id, _options = {}) {
        const photoId = normalizePhotoId(id);
        if (!photoId) return null;

        const photos = await this.list();
        const index = photos.findIndex((photo) => Number(photo.id) === photoId);
        if (index === -1) return null;

        const [deletedPhoto] = photos.splice(index, 1);
        await this.#writeAll(photos);
        return deletedPhoto;
    }

    async beginMediaMutation(id, { operationId, kind, generation, ttlMs }) {
        const photoId = normalizePhotoId(id);
        const photo = await this.findById(photoId);
        if (!photo) return null;
        const active = this.mediaOperations.get(photoId);
        if (active && active.expiresAtMs > Date.now()) {
            throw new MediaMutationConflictError(
                photoId,
                active.kind,
                new Date(active.expiresAtMs).toISOString()
            );
        }
        const operation = {
            id: operationId,
            kind,
            generation,
            expiresAtMs: Date.now() + (Number(ttlMs) || 1_200_000)
        };
        this.mediaOperations.set(photoId, operation);
        return {
            photo,
            operation: {
                ...operation,
                expiresAt: new Date(operation.expiresAtMs).toISOString()
            }
        };
    }

    async completeMediaMutation(id, operationId, changes, options = {}) {
        const photoId = normalizePhotoId(id);
        const active = this.mediaOperations.get(photoId);
        if (!active || active.id !== operationId) {
            throw new RepositoryConflictError(
                'L’operazione media non è più attiva.',
                'MEDIA_OPERATION_STALE'
            );
        }
        const updated = await this.updateById(photoId, changes, options);
        this.mediaOperations.delete(photoId);
        return updated;
    }

    async abortMediaMutation(id, operationId) {
        const photoId = normalizePhotoId(id);
        const active = this.mediaOperations.get(photoId);
        if (!active || active.id !== operationId) return null;
        this.mediaOperations.delete(photoId);
        return this.findById(photoId);
    }

    async getMediaMutation(id) {
        const photoId = normalizePhotoId(id);
        const photo = await this.findById(photoId);
        if (!photo) return null;
        const active = this.mediaOperations.get(photoId);
        return {
            photo,
            operation: active && active.expiresAtMs > Date.now()
                ? {
                    id: active.id,
                    kind: active.kind,
                    generation: active.generation,
                    expiresAt: new Date(active.expiresAtMs).toISOString()
                }
                : null
        };
    }

    async #writeAll(photos) {
        const records = Array.isArray(photos)
            ? photos.map((photo) => toStoragePhoto(photo))
            : [];
        await this.metadataStorage.writeMetadataFile(PHOTOS_METADATA_FILE, records);
    }
}

class JsonSeriesRepository {
    constructor(metadataStorage) {
        this.metadataStorage = metadataStorage;
    }

    async list() {
        const records = await this.metadataStorage.readMetadataFile(SERIES_METADATA_FILE, []);
        return normalizeSeriesCollection(records);
    }

    async findByIdentifier(identifier) {
        const normalizedIdentifier = String(identifier ?? '');
        const series = await this.list();
        return series.find((item) => (
            String(item.id) === normalizedIdentifier
            || item.slug === normalizedIdentifier
        )) || null;
    }

    async create(seriesRecord, _options = {}) {
        const allSeries = await this.list();
        const newSeries = normalizeSeriesRecord(seriesRecord);
        assertUniqueSeriesIdentity(allSeries, newSeries);

        allSeries.push(newSeries);
        const persistedSeries = await this.#writeAll(allSeries);
        return persistedSeries.find((item) => String(item.id) === String(newSeries.id)) || null;
    }

    async updateById(id, changes, _options = {}) {
        const seriesId = String(id ?? '');
        const allSeries = await this.list();
        const index = allSeries.findIndex((item) => String(item.id) === seriesId);
        if (index === -1) return null;

        const existingSeries = allSeries[index];
        const titleChanged = changes.title !== undefined
            && normalizeSeriesTitleKey(changes.title) !== normalizeSeriesTitleKey(existingSeries.title);
        const nextSlug = changes.slug !== undefined
            ? changes.slug
            : titleChanged
                ? createSeriesSlug(changes.title)
                : existingSeries.slug;
        const updatedSeries = normalizeSeriesRecord(new Series({
            ...existingSeries,
            ...changes,
            slug: nextSlug,
            id: existingSeries.id,
            createdAt: existingSeries.createdAt,
            updatedAt: new Date().toISOString()
        }).toJSON());

        assertUniqueSeriesIdentity(allSeries, updatedSeries, seriesId);
        allSeries[index] = updatedSeries;
        const persistedSeries = await this.#writeAll(allSeries);
        return persistedSeries.find((item) => String(item.id) === seriesId) || null;
    }

    async deleteById(id, _options = {}) {
        const seriesId = String(id ?? '');
        const allSeries = await this.list();
        const index = allSeries.findIndex((item) => String(item.id) === seriesId);
        if (index === -1) return null;

        const [deletedSeries] = allSeries.splice(index, 1);
        await this.#writeAll(allSeries);
        return deletedSeries;
    }

    async addPhoto(id, photoId, _options = {}) {
        const normalizedPhotoId = normalizePhotoId(photoId);
        if (!normalizedPhotoId) {
            throw new TypeError('photoId deve essere un ID numerico positivo.');
        }

        const seriesId = String(id ?? '');
        const allSeries = await this.list();
        const index = allSeries.findIndex((item) => String(item.id) === seriesId);
        if (index === -1) return null;

        const seriesInstance = new Series(allSeries[index]);
        seriesInstance.addPhoto(normalizedPhotoId);
        allSeries[index] = seriesInstance.toJSON();
        const persistedSeries = await this.#writeAll(allSeries);
        return persistedSeries.find((item) => String(item.id) === seriesId) || null;
    }

    async removePhoto(id, photoId, _options = {}) {
        const normalizedPhotoId = normalizePhotoId(photoId);
        if (!normalizedPhotoId) {
            throw new TypeError('photoId deve essere un ID numerico positivo.');
        }

        const seriesId = String(id ?? '');
        const allSeries = await this.list();
        const index = allSeries.findIndex((item) => String(item.id) === seriesId);
        if (index === -1) return null;

        const seriesInstance = new Series(allSeries[index]);
        seriesInstance.removePhoto(normalizedPhotoId);
        allSeries[index] = seriesInstance.toJSON();
        const persistedSeries = await this.#writeAll(allSeries);
        return persistedSeries.find((item) => String(item.id) === seriesId) || null;
    }

    async removePhotoReferences(photoId, _options = {}) {
        const normalizedPhotoId = normalizePhotoId(photoId);
        if (!normalizedPhotoId) {
            throw new TypeError('photoId deve essere un ID numerico positivo.');
        }

        // Deliberately operate on the raw JSON representation. This preserves
        // the current adapter behavior until the transactional migration.
        const records = await this.metadataStorage.readMetadataFile(SERIES_METADATA_FILE, []);
        if (!Array.isArray(records) || records.length === 0) {
            return {
                modified: false,
                modifiedCount: 0,
                series: []
            };
        }

        let modifiedCount = 0;
        const nextSeries = records.map((record) => {
            const result = removePhotoReferencesFromSeriesRecord(record, normalizedPhotoId);
            if (result.changed) modifiedCount += 1;
            return result.series;
        });

        if (modifiedCount > 0) {
            await this.metadataStorage.writeMetadataFile(SERIES_METADATA_FILE, nextSeries);
        }

        return {
            modified: modifiedCount > 0,
            modifiedCount,
            series: nextSeries
        };
    }

    async #writeAll(series) {
        const normalized = normalizeSeriesCollection(series);
        await this.metadataStorage.writeMetadataFile(SERIES_METADATA_FILE, normalized);
        return normalized;
    }
}

class JsonPortfolioRepository {
    constructor(metadataStorage) {
        if (
            !metadataStorage
            || typeof metadataStorage.readMetadataFile !== 'function'
            || typeof metadataStorage.writeMetadataFile !== 'function'
        ) {
            throw new TypeError('JsonPortfolioRepository richiede un metadata storage leggibile e scrivibile.');
        }

        this.capabilities = Object.freeze({
            transactions: false,
            optimisticConcurrency: false,
            referentialIntegrity: false,
            perEntityWrites: false,
            distributedMediaMutations: false,
            distributedPhotoCreations: false,
            auditHistory: false
        });
        this.photos = new JsonPhotoRepository(metadataStorage);
        this.series = new JsonSeriesRepository(metadataStorage);
    }

    async deletePhotoWithReferences(photoId, options = {}) {
        const deletedPhoto = await this.photos.deleteById(photoId, options);
        if (!deletedPhoto) return null;

        let referenceCleanup = null;
        let referenceCleanupError = null;
        try {
            referenceCleanup = await this.series.removePhotoReferences(photoId, options);
        } catch (error) {
            // Compatibility with the existing API: metadata deletion succeeds
            // even if the best-effort series cleanup fails.
            referenceCleanupError = error;
        }

        return {
            photo: deletedPhoto,
            referenceCleanup,
            referenceCleanupError
        };
    }
}

module.exports = {
    JsonPortfolioRepository
};
