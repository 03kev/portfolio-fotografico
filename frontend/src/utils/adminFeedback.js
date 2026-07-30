const normalizeLabel = (value, fallback) => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const quotedLabel = (value, fallback) => `“${normalizeLabel(value, fallback)}”`;

export const adminFeedback = Object.freeze({
  sessionStarted: () => 'Sessione admin attivata.',
  sessionEnded: () => 'Sessione admin disattivata.',

  photoCreated: (photo) => `Foto caricata: ${quotedLabel(photo?.title, 'Senza titolo')}.`,
  photoUpdated: (photo) => `Dettagli aggiornati: ${quotedLabel(photo?.title, 'Foto')}.`,
  photoDeleted: (photo) => `Foto eliminata: ${quotedLabel(photo?.title, 'Foto')}.`,
  photoSourceReplaced: (photo) => (
    `Originale sostituito: ${quotedLabel(photo?.title, 'Foto')}. Le varianti sono state rigenerate.`
  ),
  photoCropApplied: (photo) => (
    `Ritaglio applicato: ${quotedLabel(photo?.title, 'Foto')}. Le varianti sono state rigenerate.`
  ),
  photoSourceUploadCancelled: () => 'Caricamento dell’originale annullato.',

  seriesCreated: (series) => `Serie creata: ${quotedLabel(series?.title, 'Senza titolo')}.`,
  seriesUpdated: (series) => `Serie aggiornata: ${quotedLabel(series?.title, 'Serie')}.`,
  seriesDeleted: (series) => `Serie eliminata: ${quotedLabel(series?.title, 'Serie')}.`,
  seriesLayoutSaved: () => 'Layout della serie salvato.'
});
