const { readMetadataFile, writeMetadataFile } = require('../services/metadataStorage');
const { toRuntimePhoto, toStoragePhoto } = require('../services/photoRecord');

async function readPhotosDB() {
    const rawPhotos = await readMetadataFile('photos.json', []);
    return Array.isArray(rawPhotos)
        ? rawPhotos.map((photo) => toRuntimePhoto(photo))
        : [];
}

async function writePhotosDB(photos) {
    const normalizedPhotos = Array.isArray(photos)
        ? photos.map((photo) => toStoragePhoto(photo))
        : [];
    await writeMetadataFile('photos.json', normalizedPhotos);
}

module.exports = {
    readPhotosDB,
    writePhotosDB
};
