// Modello Photo per future integrazioni con database
class Photo {
  constructor({
    id,
    title,
    location,
    lat,
    lng,
    image,
    thumbnail,
    description,
    date,
    camera,
    lens,
    settings,
    tags
  }) {
    this.id = id;
    this.title = title;
    this.location = location;
    this.lat = lat;
    this.lng = lng;
    this.image = image;
    this.thumbnail = thumbnail;
    this.description = description;
    this.date = date;
    this.camera = camera;
    this.lens = lens;
    this.settings = settings; // { aperture, shutter, iso, focal }
    this.tags = tags || [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Metodi per validazione
  static validate(photoData) {
    const required = ['title', 'location', 'lat', 'lng', 'image'];
    const missing = required.filter(field => !photoData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Campi mancanti: ${missing.join(', ')}`);
    }

    // Validazione coordinate
    if (photoData.lat < -90 || photoData.lat > 90) {
      throw new Error('Latitudine non valida');
    }
    if (photoData.lng < -180 || photoData.lng > 180) {
      throw new Error('Longitudine non valida');
    }

    return true;
  }

  // Metodo per creare thumbnail URL
  getThumbnailUrl() {
    if (this.thumbnail) return this.thumbnail;
    return this.image.replace('/uploads/', '/uploads/thumbnails/').replace(/\.(jpg|jpeg|png)$/i, '_thumb.webp');
  }

  // Metodo per formattare la data
  getFormattedDate() {
    return new Date(this.date).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Metodo per ottenere coordinate come array
  getCoordinates() {
    return [this.lat, this.lng];
  }

  // Metodo per serializzare in JSON
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      location: this.location,
      lat: this.lat,
      lng: this.lng,
      image: this.image,
      thumbnail: this.thumbnail || this.getThumbnailUrl(),
      description: this.description,
      date: this.date,
      camera: this.camera,
      lens: this.lens,
      settings: this.settings,
      tags: this.tags,
      formattedDate: this.getFormattedDate(),
      coordinates: this.getCoordinates()
    };
  }
}

module.exports = Photo;
