import {
  PHOTO_TAG_MAX_ITEMS,
  definePhotoMetadataConsumer,
  getPhotoMetadataField,
  normalizePhotoSettings,
  normalizePhotoTags
} from '@portfolio/photo-metadata-contract';

export const PHOTO_METADATA_ADMIN_COVERAGE = definePhotoMetadataConsumer({
  id: 'frontend.admin-form',
  consumer: 'Frontend photo admin form',
  handled: [
    'title', 'description', 'date', 'location', 'lat', 'lng',
    'camera', 'lens', 'settings', 'tags'
  ],
  excluded: {
    id: 'Identità read-only assegnata dal backend.',
    resolution: 'Risoluzione derivata da Sharp e non modificabile dal form.',
    createdAt: 'Creazione read-only del record Postgres; non è la data dello scatto.',
    updatedAt: 'Timestamp read-only assegnato dal service.',
    version: 'Versione letta dal client API ma non modificabile nel form.',
    derivativesVersion: 'Versione tecnica gestita dal lifecycle media.',
    mediaGeneration: 'Generazione tecnica gestita dal lifecycle media.',
    assets: 'Inventario read-only gestito dal lifecycle media.'
  }
});

export const PHOTO_METADATA_PUBLIC_DETAILS_COVERAGE = definePhotoMetadataConsumer({
  id: 'frontend.public-details',
  consumer: 'Public photo modal details',
  handled: [
    'id', 'title', 'description', 'date', 'location', 'camera', 'lens',
    'resolution', 'settings', 'tags', 'assets'
  ],
  excluded: {
    lat: 'Le coordinate alimentano la mappa, non il pannello testuale del modal.',
    lng: 'Le coordinate alimentano la mappa, non il pannello testuale del modal.',
    createdAt: 'Timestamp amministrativo non mostrato al pubblico.',
    updatedAt: 'Timestamp amministrativo non mostrato al pubblico.',
    version: 'Versione di concorrenza non pubblica.',
    derivativesVersion: 'Versione tecnica usata dagli URL degli asset.',
    mediaGeneration: 'Ownership tecnica degli asset non mostrata al pubblico.'
  }
});

export const PHOTO_METADATA_PUBLIC_SEO_COVERAGE = definePhotoMetadataConsumer({
  id: 'frontend.public-seo',
  consumer: 'Public photo SEO page',
  handled: ['id', 'title', 'description', 'date', 'location', 'tags', 'assets'],
  excluded: {
    lat: 'Le coordinate non sono attualmente pubblicate nei dati strutturati.',
    lng: 'Le coordinate non sono attualmente pubblicate nei dati strutturati.',
    camera: 'Dato tecnico escluso intenzionalmente dai metadata SEO correnti.',
    lens: 'Dato tecnico escluso intenzionalmente dai metadata SEO correnti.',
    resolution: 'La risoluzione è derivata e non è un campo SEO corrente.',
    settings: 'EXIF tecnici esclusi intenzionalmente dai metadata SEO correnti.',
    createdAt: 'Non rappresenta la data dello scatto.',
    updatedAt: 'Non rappresenta la data dello scatto.',
    version: 'Versione di concorrenza non pubblica.',
    derivativesVersion: 'Versione tecnica incorporata negli asset.',
    mediaGeneration: 'Ownership tecnica non pubblica.'
  }
});

export const PHOTO_METADATA_PUBLIC_MAP_COVERAGE = definePhotoMetadataConsumer({
  id: 'frontend.public-map',
  consumer: 'Public globe photo markers',
  handled: ['id', 'title', 'location', 'lat', 'lng', 'assets'],
  excluded: {
    description: 'Non necessaria per il posizionamento del marker.',
    date: 'Non necessaria per il posizionamento del marker.',
    camera: 'Non necessaria per il posizionamento del marker.',
    lens: 'Non necessaria per il posizionamento del marker.',
    resolution: 'Non necessaria per il posizionamento del marker.',
    settings: 'Non necessari per il posizionamento del marker.',
    tags: 'Non necessari per il posizionamento del marker.',
    createdAt: 'Timestamp amministrativo non usato dal globo.',
    updatedAt: 'Timestamp amministrativo non usato dal globo.',
    version: 'Versione di concorrenza non usata dal globo.',
    derivativesVersion: 'Versione tecnica incorporata negli asset.',
    mediaGeneration: 'Ownership tecnica non usata dal globo.'
  }
});

const asFormCoordinate = (value) => (value === null || value === undefined ? '' : String(value));

export function buildPhotoMetadataFormState(photo = null, {
  defaultCreateDate = new Date().toISOString().split('T')[0]
} = {}) {
  const settings = normalizePhotoSettings(photo?.settings ?? {});
  return {
    title: photo?.title ?? '',
    description: photo?.description ?? '',
    date: photo ? (photo.date ?? '') : defaultCreateDate,
    location: photo?.location ?? '',
    lat: asFormCoordinate(photo?.lat),
    lng: asFormCoordinate(photo?.lng),
    camera: photo?.camera ?? '',
    lens: photo?.lens ?? '',
    settings: {
      aperture: '',
      shutter: '',
      iso: '',
      focal: '',
      ...settings
    },
    tags: normalizePhotoTags(photo?.tags ?? [])
  };
}

export function addPhotoTag(tags, value) {
  return normalizePhotoTags([...(tags || []), String(value ?? '')]);
}

export function getPhotoFieldLimits(key) {
  return getPhotoMetadataField(key).limits || {};
}

export function hasPhotoCoordinates(photo) {
  return Boolean(photo)
    && photo.lat !== null
    && photo.lat !== undefined
    && photo.lng !== null
    && photo.lng !== undefined
    && Number.isFinite(Number(photo.lat))
    && Number.isFinite(Number(photo.lng));
}

export { PHOTO_TAG_MAX_ITEMS };
