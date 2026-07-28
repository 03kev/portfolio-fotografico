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
  photoDeletePartial: (failedAssetCount) => {
    const count = Math.max(1, Number(failedAssetCount) || 1);
    const noun = count === 1 ? 'file non è stato rimosso' : 'file non sono stati rimossi';
    return `Foto eliminata, ma ${count} ${noun} dallo storage. Controlla i log prima di riprovare.`;
  },
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
