import {
  buildEmbeddedLocation,
  buildReverseGeocodeLocation,
  joinLocationParts,
  normalizeGpsCoordinates,
  reverseGeocodeCoordinates
} from '../utils/photoMetadata';

describe('photo metadata location helpers', () => {
  test('builds a complete deduplicated embedded location', () => {
    expect(buildEmbeddedLocation({
      SubLocation: 'Staré Město',
      City: 'Praga',
      ProvinceState: 'Praga',
      CountryName: 'Cechia'
    })).toBe('Staré Město, Praga, Cechia');
  });

  test('combines reverse-geocoder locality, city, region and country', () => {
    expect(buildReverseGeocodeLocation({
      locality: 'Montmartre',
      city: 'Parigi',
      principalSubdivision: 'Île-de-France',
      countryName: 'Francia'
    })).toBe('Montmartre, Parigi, Île-de-France, Francia');
    expect(joinLocationParts('Praga', 'Praga', 'Cechia')).toBe('Praga, Cechia');
  });

  test('accepts valid zero coordinates and rejects out-of-range values', () => {
    expect(normalizeGpsCoordinates({ latitude: 0, longitude: 0 })).toEqual({
      latitude: 0,
      longitude: 0
    });
    expect(normalizeGpsCoordinates({ latitude: 91, longitude: 0 })).toBeNull();
  });

  test('checks the geocoder response and returns the complete label', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locality: 'Varsavia',
        principalSubdivision: 'Masovia',
        countryName: 'Polonia'
      })
    });

    await expect(reverseGeocodeCoordinates(52.23, 21.01, { fetchImpl }))
      .resolves.toBe('Varsavia, Masovia, Polonia');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('rejects HTTP errors instead of treating them as valid locations', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429
    });

    await expect(reverseGeocodeCoordinates(52.23, 21.01, { fetchImpl }))
      .rejects.toThrow('Reverse geocoding fallito (429)');
  });
});
