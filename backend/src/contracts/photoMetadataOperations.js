const { definePhotoMetadataConsumer } = require('@portfolio/photo-metadata-contract');

const PHOTO_METADATA_CREATE_PATCH_COVERAGE = definePhotoMetadataConsumer({
    id: 'backend.create-patch',
    consumer: 'Photo create and editorial patch operations',
    handled: [
        'id', 'title', 'description', 'date', 'location', 'lat', 'lng',
        'camera', 'lens', 'settings', 'tags'
    ],
    excluded: {
        resolution: 'Derivato da Sharp durante la pubblicazione delle derivate.',
        createdAt: 'Creazione del record Postgres, assegnata dal database o dall’intent.',
        updatedAt: 'Assegnato dal service al momento della mutazione.',
        version: 'Incrementato dal repository Postgres.',
        derivativesVersion: 'Gestito dal lifecycle media.',
        mediaGeneration: 'Gestito dal lifecycle media.',
        assets: 'Gestiti dal registro degli asset, non dal payload editoriale.'
    }
});

const PHOTO_METADATA_MEDIA_REPLACEMENT_COVERAGE = definePhotoMetadataConsumer({
    id: 'backend.media-replacement',
    consumer: 'Photo source replacement and derivative publication',
    handled: ['resolution', 'updatedAt', 'derivativesVersion', 'mediaGeneration', 'assets'],
    excluded: {
        id: 'Identità immutabile usata come chiave dell’operazione.',
        title: 'Metadata editoriale preservato dalla sostituzione del source.',
        description: 'Metadata editoriale preservato dalla sostituzione del source.',
        date: 'Metadata editoriale o EXIF preservato dalla sostituzione del source.',
        location: 'Metadata editoriale o EXIF preservato dalla sostituzione del source.',
        lat: 'Metadata editoriale o EXIF preservato dalla sostituzione del source.',
        lng: 'Metadata editoriale o EXIF preservato dalla sostituzione del source.',
        camera: 'Metadata editoriale o EXIF preservato dalla sostituzione del source.',
        lens: 'Metadata editoriale o EXIF preservato dalla sostituzione del source.',
        settings: 'Crop ed EXIF esistenti sono letti ma non reinterpretati dal replace-source.',
        tags: 'Metadata editoriale preservato dalla sostituzione del source.',
        createdAt: 'Creazione immutabile del record Postgres.',
        version: 'Incrementato dal repository Postgres.'
    }
});

module.exports = {
    PHOTO_METADATA_CREATE_PATCH_COVERAGE,
    PHOTO_METADATA_MEDIA_REPLACEMENT_COVERAGE
};
