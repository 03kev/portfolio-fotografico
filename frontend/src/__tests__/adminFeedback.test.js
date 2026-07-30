import { adminFeedback } from '../utils/adminFeedback';

describe('adminFeedback', () => {
  test('describes successful mutations with the affected entity', () => {
    expect(adminFeedback.photoCreated({ title: 'Pioggia' }))
      .toBe('Foto caricata: “Pioggia”.');
    expect(adminFeedback.seriesUpdated({ title: 'Varsavia' }))
      .toBe('Serie aggiornata: “Varsavia”.');
  });

  test('uses readable fallbacks for unnamed entities', () => {
    expect(adminFeedback.photoDeleted({}))
      .toBe('Foto eliminata: “Foto”.');
    expect(adminFeedback.seriesCreated(null))
      .toBe('Serie creata: “Senza titolo”.');
  });
});
