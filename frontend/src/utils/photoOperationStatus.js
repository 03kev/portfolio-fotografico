const STATUS_PRESETS = Object.freeze({
  create: Object.freeze({
    prepare: Object.freeze({
      active: true,
      type: 'new-upload',
      percent: 3,
      label: 'Preparazione caricamento',
      step: 'sign'
    }),
    sign: Object.freeze({
      percent: 8,
      label: 'Creazione collegamento sicuro',
      step: 'sign'
    }),
    upload: Object.freeze({
      percent: 12,
      label: 'Caricamento originale',
      step: 'upload'
    }),
    process: Object.freeze({
      percent: 84,
      label: 'Generazione varianti',
      step: 'create'
    }),
    done: Object.freeze({
      percent: 100,
      label: 'Foto caricata',
      step: 'done'
    })
  }),
  edit: Object.freeze({
    save: Object.freeze({
      active: true,
      type: 'edit',
      percent: 18,
      label: 'Salvataggio dettagli',
      step: 'update'
    }),
    done: Object.freeze({
      percent: 100,
      label: 'Dettagli aggiornati',
      step: 'done'
    })
  }),
  replaceSource: Object.freeze({
    prepare: Object.freeze({
      active: true,
      type: 'source-reupload',
      percent: 3,
      label: 'Preparazione sostituzione',
      step: 'sign'
    }),
    sign: Object.freeze({
      percent: 8,
      label: 'Creazione collegamento sicuro',
      step: 'sign'
    }),
    upload: Object.freeze({
      percent: 12,
      label: 'Caricamento nuovo originale',
      step: 'upload'
    }),
    process: Object.freeze({
      percent: 74,
      label: 'Rigenerazione varianti',
      step: 'replace'
    }),
    done: Object.freeze({
      percent: 100,
      label: 'Originale sostituito',
      step: 'done'
    })
  }),
  crop: Object.freeze({
    save: Object.freeze({
      active: true,
      type: 'crop',
      percent: 12,
      label: 'Salvataggio ritaglio',
      step: 'update'
    }),
    process: Object.freeze({
      percent: 24,
      label: 'Rigenerazione varianti',
      step: 'regenerate'
    }),
    done: Object.freeze({
      percent: 100,
      label: 'Ritaglio applicato',
      step: 'done'
    })
  })
});

const OPERATION_LABELS = Object.freeze({
  'new-upload': 'Nuova foto',
  'source-reupload': 'Sostituzione originale',
  edit: 'Modifica dettagli',
  crop: 'Ritaglio foto'
});

export function buildPhotoOperationStatus(operation, phase, overrides = {}) {
  const preset = STATUS_PRESETS[operation]?.[phase];
  if (!preset) {
    throw new Error(`Stato operazione foto non valido: ${operation}.${phase}`);
  }
  return { ...preset, ...overrides };
}
export function getPhotoOperationProgress(status) {
  const numericPercent = Number(status?.percent);
  const percent = Number.isFinite(numericPercent)
    ? Math.max(0, Math.min(100, numericPercent))
    : 0;
  const operationLabel = OPERATION_LABELS[status?.type] || 'Operazione foto';
  const phaseLabel = String(status?.label || 'Operazione in corso').trim();

  return {
    percent,
    operationLabel,
    phaseLabel,
    progressLabel: percent >= 100 ? 'Completata' : 'Avanzamento stimato',
    ariaValueText: `${operationLabel}: ${phaseLabel}, ${Math.round(percent)}%`
  };
}
