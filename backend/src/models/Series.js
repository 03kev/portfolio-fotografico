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
    this.slug = slug || this.createSlug(title);
    this.description = description;
    this.coverImage = coverImage; // ID della foto di copertina
    this.photos = photos || []; // Array di ID foto
    this.content = content || []; // Array di blocchi di contenuto
    this.published = published !== undefined ? published : false;
    this.createdAt = createdAt || new Date().toISOString();
    this.updatedAt = updatedAt || new Date().toISOString();
  }

  createSlug(title) {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // Validazione
  static validate(seriesData) {
    const required = ['title', 'description'];
    const missing = required.filter(field => !seriesData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Campi mancanti: ${missing.join(', ')}`);
    }

    if (seriesData.title.length < 3) {
      throw new Error('Il titolo deve essere di almeno 3 caratteri');
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

  addContentBlock(block) {
    // block: { type: 'text|image|photos', content: string|photoId|photoIds, order: number }
    this.content.push(block);
    this.updatedAt = new Date().toISOString();
  }

  updateContentBlock(index, block) {
    if (this.content[index]) {
      this.content[index] = { ...this.content[index], ...block };
      this.updatedAt = new Date().toISOString();
    }
  }

  removeContentBlock(index) {
    this.content.splice(index, 1);
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
