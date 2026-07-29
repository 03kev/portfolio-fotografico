import exifr from 'exifr';

const PHOTO_METADATA_TAGS = [
  'Model',
  'Make',
  'LensModel',
  'FNumber',
  'ExposureTime',
  'ISO',
  'FocalLength',
  'DateTimeOriginal',
  'GPSLatitude',
  'GPSLongitude',
  'GPSLatitudeRef',
  'GPSLongitudeRef',
  'Location',
  'SubLocation',
  'Sublocation',
  'City',
  'State',
  'ProvinceState',
  'Country',
  'CountryName'
];

const toText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const firstText = (...values) => {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return '';
};

const appendUniquePart = (parts, value) => {
  const text = toText(value);
  if (!text) return;

  const normalized = text.toLocaleLowerCase('it-IT');
  const isDuplicate = parts.some((part) => {
    const normalizedPart = part.toLocaleLowerCase('it-IT');
    return normalizedPart === normalized
      || normalizedPart.endsWith(`, ${normalized}`)
      || normalized.endsWith(`, ${normalizedPart}`);
  });

  if (!isDuplicate) parts.push(text);
};

export const joinLocationParts = (...values) => {
  const parts = [];
  values.flat(Infinity).forEach((value) => appendUniquePart(parts, value));
  return parts.join(', ');
};

export const buildEmbeddedLocation = (metadata = {}) => joinLocationParts(
  firstText(metadata.SubLocation, metadata.Sublocation, metadata.Location),
  metadata.City,
  firstText(metadata.State, metadata.ProvinceState),
  firstText(metadata.CountryName, metadata.Country)
);

export const buildReverseGeocodeLocation = (data = {}) => joinLocationParts(
  data.locality,
  data.city,
  data.principalSubdivision,
  data.countryName
);

const normalizeCoordinate = (value, minimum, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
};

export const normalizeGpsCoordinates = (gps) => {
  if (!gps) return null;
  const latitude = normalizeCoordinate(gps.latitude, -90, 90);
  const longitude = normalizeCoordinate(gps.longitude, -180, 180);
  return latitude === null || longitude === null
    ? null
    : { latitude, longitude };
};

const formatCamera = (make, model) => {
  const normalizedMake = toText(make);
  const normalizedModel = toText(model);
  if (!normalizedMake) return normalizedModel;
  if (!normalizedModel) return normalizedMake;
  if (normalizedModel.toLocaleLowerCase('it-IT').startsWith(
    normalizedMake.toLocaleLowerCase('it-IT')
  )) {
    return normalizedModel;
  }
  return `${normalizedMake} ${normalizedModel}`;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const formatShutter = (value) => {
  const exposure = Number(value);
  if (!Number.isFinite(exposure) || exposure <= 0) return '';
  if (exposure < 1) return `1/${Math.round(1 / exposure)}s`;
  return `${exposure}s`;
};

export const readPhotoMetadata = async (file) => {
  const [metadataResult, gpsResult] = await Promise.allSettled([
    exifr.parse(file, PHOTO_METADATA_TAGS),
    exifr.gps(file)
  ]);

  const metadata = metadataResult.status === 'fulfilled' && metadataResult.value
    ? metadataResult.value
    : {};
  const coordinates = normalizeGpsCoordinates(
    gpsResult.status === 'fulfilled' ? gpsResult.value : null
  );
  const embeddedLocation = buildEmbeddedLocation(metadata);

  const extracted = {
    date: formatDate(metadata.DateTimeOriginal),
    camera: formatCamera(metadata.Make, metadata.Model),
    lens: toText(metadata.LensModel),
    location: embeddedLocation,
    coordinates,
    settings: {
      aperture: metadata.FNumber ? `f/${metadata.FNumber}` : '',
      shutter: formatShutter(metadata.ExposureTime),
      iso: metadata.ISO ? toText(metadata.ISO) : '',
      focal: metadata.FocalLength ? `${metadata.FocalLength}mm` : ''
    }
  };

  const hasMetadata = Boolean(
    extracted.date
    || extracted.camera
    || extracted.lens
    || extracted.location
    || extracted.coordinates
    || Object.values(extracted.settings).some(Boolean)
  );

  if (!hasMetadata && metadataResult.status === 'rejected' && gpsResult.status === 'rejected') {
    throw metadataResult.reason || gpsResult.reason;
  }

  return { ...extracted, hasMetadata };
};

export const reverseGeocodeCoordinates = async (
  latitude,
  longitude,
  { signal, fetchImpl = fetch } = {}
) => {
  const coordinates = normalizeGpsCoordinates({ latitude, longitude });
  if (!coordinates) throw new TypeError('Coordinate non valide');

  const fallback = `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
  const query = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    localityLanguage: 'it'
  });
  const response = await fetchImpl(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?${query}`,
    { signal }
  );
  if (!response.ok) {
    throw new Error(`Reverse geocoding fallito (${response.status})`);
  }

  const data = await response.json();
  return buildReverseGeocodeLocation(data) || fallback;
};
