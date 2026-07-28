const { createSeriesSlug } = require('../services/seriesRecord');

// Modello Series per le serie fotografiche
class Series {
    constructor({
        id,
        title,
        slug,
        description,
        coverImage,
        photos,
        content,
        published,
        createdAt,
        updatedAt
    }) {
        this.id = id;
        this.title = title;
        this.slug = slug || createSeriesSlug(title);
        this.description = description;
        this.coverImage = coverImage; // ID della foto di copertina
        this.photos = photos || []; // Array di ID foto
        this.content = content || []; // Array di blocchi di contenuto
        this.published = published !== undefined ? published : false;
        this.createdAt = createdAt || new Date().toISOString();
        this.updatedAt = updatedAt || new Date().toISOString();
    }

    // Validazione
    static validate(seriesData) {
        const required = ['title', 'description'];
        const missing = required.filter(field => !seriesData[field]);

        if (missing.length > 0) {
            const error = new Error(`Campi mancanti: ${missing.join(', ')}`);
            error.status = 400;
            error.code = 'SERIES_VALIDATION_FAILED';
            error.details = { fields: missing.join(',') };
            throw error;
        }

        if (seriesData.title.length < 3) {
            const error = new Error('Il titolo deve essere di almeno 3 caratteri');
            error.status = 400;
            error.code = 'SERIES_VALIDATION_FAILED';
            error.details = { field: 'title', minimumLength: 3 };
            throw error;
        }

        return true;
    }

    // Metodi helper
    addPhoto(photoId) {
        if (!this.photos.includes(photoId)) {
            this.photos.push(photoId);
            this.updatedAt = new Date().toISOString();
        }
    }

    removePhoto(photoId) {
        this.photos = this.photos.filter(id => id !== photoId);
        this.updatedAt = new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            slug: this.slug,
            description: this.description,
            coverImage: this.coverImage,
            photos: this.photos,
            content: this.content,
            published: this.published,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = Series;
