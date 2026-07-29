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

  test('distinguishes partial storage cleanup from full success', () => {
    expect(adminFeedback.photoDeletePartial(1))
      .toContain('1 file non è stato rimosso');
    expect(adminFeedback.photoDeletePartial(3))
      .toContain('3 file non sono stati rimossi');
  });
});
