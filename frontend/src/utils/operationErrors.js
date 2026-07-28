const NETWORK_ERROR_PATTERNS = [
  /networkerror/i,
  /failed to fetch/i,
  /load failed/i,
  /network request failed/i
];

const TIMEOUT_ERROR_PATTERNS = [
  /timeout/i,
  /econnaborted/i
];

const LOW_LEVEL_NETWORK_ERROR_PATTERNS = [
  /eaddrnotavail/i,
  /enotfound/i,
  /eai_again/i,
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /enetunreach/i,
  /ehostunreach/i,
  /socket hang up/i,
  /getaddrinfo/i,
  /dns/i
];

const CORS_ERROR_PATTERNS = [
  /\bcors\b/i,
  /access-control-allow-origin/i,
  /preflight request/i,
  /cross-origin/i
];

const GENERIC_SERVER_MESSAGE_PATTERNS = [
  /^errore del server$/i,
  /^errore interno del server$/i,
  /^internal server error$/i,
  /^request failed with status code 5\d\d$/i,
  /^errore durante/i,
  /^errore nell['’]/i
];

const isMatchingPattern = (message, patterns) => patterns.some((pattern) => pattern.test(message));

const ERROR_CODE_MESSAGES = Object.freeze({
  AUTH_INVALID_CREDENTIALS: () => 'Token admin non valido.',
  AUTH_NOT_CONFIGURED: () => 'Autenticazione admin non configurata sul server.',
  AUTH_RATE_LIMITED: ({ error }) => {
    const seconds = Number.parseInt(String(error?.retryAfter || ''), 10);
    return Number.isFinite(seconds) && seconds > 0
      ? `Troppi tentativi di accesso. Riprova tra circa ${seconds} secondi.`
      : 'Troppi tentativi di accesso. Attendi prima di riprovare.';
  },
  AUTH_REQUIRED: () => 'La sessione admin è scaduta o non è attiva. Accedi di nuovo.',
  METADATA_READ_ONLY: () => 'Le modifiche ai contenuti sono temporaneamente disabilitate.',
  EXPECTED_VERSION_REQUIRED: () => 'I dati locali non hanno una versione valida. Ricarica la pagina e riprova.',
  INVALID_EXPECTED_VERSION: () => 'La versione locale dei dati non è valida. Ricarica la pagina.',
  EXPECTED_VERSION_MISMATCH: () => 'Sono state inviate versioni dei dati discordanti. Ricarica la pagina.',
  VERSION_CONFLICT: () => 'Il contenuto è stato modificato da un’altra operazione. I dati sono stati aggiornati: verifica e riprova.',
  PHOTO_MUTATION_IN_PROGRESS: () => 'È già in corso un’operazione sui file di questa foto. Attendi che termini e riprova.',
  MEDIA_OPERATION_STALE: () => 'L’operazione sui file non è più valida. Seleziona nuovamente il file e riprova.',
  MEDIA_GENERATION_MISMATCH: () => 'La versione dei file non coincide più con quella della foto. Ricarica e riprova.',
  INVALID_MEDIA_OPERATION: () => 'La preparazione dell’operazione sui file è incompleta. Seleziona nuovamente il file.',
  INVALID_MEDIA_OPERATION_ID: () => 'Identificativo dell’operazione sui file non valido.',
  MEDIA_GENERATION_REQUIRED: () => 'Identificativo della versione dei file mancante. Ripeti il caricamento.',
  PHOTO_SOURCE_UNAVAILABLE: () => 'Il file originale di questa foto non è disponibile.',
  PHOTO_SOURCE_NOT_FOUND: () => 'Il file originale non è stato trovato nello storage. Ripeti il caricamento.',
  PHOTO_ASSET_NOT_FOUND: () => 'Il file pubblico della foto non è stato trovato nello storage.',
  PHOTO_ID_CONFLICT: () => 'Esiste già una foto con questo identificativo. Ripeti il caricamento.',
  PHOTO_SOURCE_PATH_CONFLICT: () => 'Il percorso del file originale è già associato a un’altra foto.',
  PHOTO_NOT_FOUND: () => 'La foto non esiste più o è già stata eliminata.',
  SERIES_NOT_FOUND: () => 'La serie non esiste più o non è accessibile.',
  SERIES_TITLE_CONFLICT: () => 'Esiste già una serie con questo titolo, anche tra le bozze.',
  SERIES_SLUG_CONFLICT: () => 'Esiste già una serie con questo indirizzo. Scegli un titolo diverso.',
  SERIES_PHOTO_CONFLICT: () => 'La foto è già presente nella serie.',
  SERIES_VALIDATION_FAILED: ({ rawMessage }) => rawMessage || 'I dati della serie non sono validi.',
  VALIDATION_ERROR: ({ rawMessage }) => rawMessage || 'I dati inseriti non sono validi.',
  REFERENCE_INTEGRITY_CONFLICT: ({ rawMessage }) => rawMessage || 'L’operazione produrrebbe riferimenti incoerenti tra foto e serie.',
  INVALID_FILE_TYPE: ({ rawMessage }) => rawMessage || 'Formato file non supportato.',
  LIMIT_FILE_SIZE: ({ rawMessage }) => rawMessage || 'Il file supera la dimensione massima consentita.',
  INVALID_COORDINATE: ({ rawMessage }) => rawMessage || 'Coordinate non valide.',
  CROP_SETTINGS_REQUIRED: () => 'Le impostazioni del crop sono mancanti.',
  UPLOAD_SIGN_INVALID_RESPONSE: () => 'Il server non ha restituito una destinazione di upload valida. Riprova.',
  SIGNED_UPLOAD_FAILED: ({ error }) => {
    const status = getHttpStatusFromError(error);
    const suffix = status ? ` (HTTP ${status})` : '';
    return `Lo storage ha rifiutato il caricamento${suffix}. La destinazione può essere scaduta: ripeti la preparazione dell’upload.`;
  },
  AUDIT_HISTORY_UNAVAILABLE: () => 'Lo storico modifiche non è disponibile con la configurazione corrente.',
  AUDIT_EVENT_NOT_FOUND: () => 'La voce dello storico non esiste più.'
});

export function compactRawMessage(value) {
  const message = String(value || '').replace(/\s+/g, ' ').trim();
  if (!message) return '';
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function getHttpStatusFromError(error) {
  const status = Number(
    error?.status
    || error?.response?.status
    || error?.error?.status
    || error?.data?.status
    || 0
  );
  return Number.isFinite(status) && status > 0 ? status : null;
}

export function getErrorCodeFromError(error) {
  const code = (
    error?.code
    || error?.error?.code
    || error?.data?.code
    || error?.response?.data?.code
    || ''
  );
  return String(code).trim().toUpperCase() || null;
}

export function isTimeoutError(error) {
  const rawMessage = compactRawMessage(error?.message || error?.error?.message || error?.data?.message || '');
  return isMatchingPattern(rawMessage, TIMEOUT_ERROR_PATTERNS);
}

export function isNetworkError(error) {
  const rawMessage = compactRawMessage(error?.message || error?.error?.message || error?.data?.message || '');
  return isMatchingPattern(rawMessage, NETWORK_ERROR_PATTERNS);
}

const readErrorDetail = (error) => {
  const candidates = [
    error?.details,
    error?.error?.details,
    error?.data?.details,
    error?.response?.data?.details
  ];
  return candidates.find((entry) => entry && typeof entry === 'object') || null;
};

const getErrorMessages = (error) => {
  const rawMessage = compactRawMessage(error?.message || error?.error?.message || error?.data?.message || '');
  const detail = readErrorDetail(error);
  const detailMessage = compactRawMessage(detail?.message || detail?.reason || detail?.detail || '');
  const combined = compactRawMessage([rawMessage, detailMessage].filter(Boolean).join(' | '));
  return { rawMessage, detailMessage, combined };
};

const isLikelyCorsError = (error, combinedMessage = '') => {
  if (Boolean(error?.likelyCors)) return true;
  return isMatchingPattern(combinedMessage, CORS_ERROR_PATTERNS);
};

const isLikelyNetworkInfrastructureError = (error) => {
  const { rawMessage, detailMessage, combined } = getErrorMessages(error);
  return (
    isNetworkError(error)
    || isTimeoutError(error)
    || isMatchingPattern(rawMessage, LOW_LEVEL_NETWORK_ERROR_PATTERNS)
    || isMatchingPattern(detailMessage, LOW_LEVEL_NETWORK_ERROR_PATTERNS)
    || isMatchingPattern(combined, LOW_LEVEL_NETWORK_ERROR_PATTERNS)
  );
};

function isGenericServerMessage(message) {
  const raw = compactRawMessage(message);
  if (!raw) return true;
  return isMatchingPattern(raw, GENERIC_SERVER_MESSAGE_PATTERNS);
}

function buildServerErrorMessage(error, stepLabel) {
  const { rawMessage, detailMessage } = getErrorMessages(error);

  const meaningful = [rawMessage, detailMessage].find((entry) => entry && !isGenericServerMessage(entry));
  if (meaningful) {
    return `Errore server (${stepLabel}): ${meaningful}`;
  }
  return `Errore server (${stepLabel}): riprova tra poco.`;
}

function buildNetworkErrorMessage(stepLabel, { likelyCors = false } = {}) {
  if (likelyCors) {
    return `Errore di rete durante ${stepLabel}: probabile problema CORS/configurazione cross-origin.`;
  }
  return `Errore di rete durante ${stepLabel}.`;
}

export function isConcurrencyError(error) {
  const status = getHttpStatusFromError(error);
  const code = getErrorCodeFromError(error);
  return (
    status === 409
    || status === 412
    || status === 428
    || [
      'VERSION_CONFLICT',
      'EXPECTED_VERSION_REQUIRED',
      'INVALID_EXPECTED_VERSION',
      'EXPECTED_VERSION_MISMATCH',
      'MEDIA_OPERATION_STALE',
      'MEDIA_GENERATION_MISMATCH'
    ].includes(code)
  );
}

export function isAmbiguousMutationError(error) {
  const status = getHttpStatusFromError(error);
  return (
    isNetworkError(error)
    || isTimeoutError(error)
    || status === null
    || status === 408
    || status >= 500
  );
}

export function buildOperationErrorMessage(error, stepLabel = 'operazione') {
  const userMessage = compactRawMessage(error?.userMessage);
  if (userMessage) return userMessage;

  const { rawMessage, combined } = getErrorMessages(error);
  const status = getHttpStatusFromError(error);
  const code = getErrorCodeFromError(error);

  if (isBrowserOffline() || Boolean(error?.offline)) {
    return `Operazione non riuscita (${stepLabel}): nessuna connessione Internet.`;
  }

  if (Boolean(error?.outcomeUnknown)) {
    return `Esito non verificabile (${stepLabel}): ricarica i dati e controlla il risultato prima di riprovare.`;
  }

  const codeMessageFactory = code ? ERROR_CODE_MESSAGES[code] : null;
  if (codeMessageFactory) {
    return `Errore (${stepLabel}): ${codeMessageFactory({ error, rawMessage })}`;
  }

  if (status === 400 || status === 422) {
    return `Errore (${stepLabel}): ${rawMessage || 'richiesta non valida.'}`;
  }
  if (status === 401) return `Errore (${stepLabel}): la sessione admin è scaduta o non è attiva. Accedi di nuovo.`;
  if (status === 403) return `Errore (${stepLabel}): non hai i permessi necessari per questa operazione.`;
  if (status === 404) return `Errore (${stepLabel}): la risorsa non esiste più o non è accessibile.`;
  if (status === 408) return `Timeout durante ${stepLabel}. Verifica il risultato prima di riprovare.`;
  if (status === 409 || status === 412) {
    return `Errore (${stepLabel}): i dati sono cambiati durante l’operazione. Sono stati ricaricati: verifica e riprova.`;
  }
  if (status === 410) return `Errore (${stepLabel}): l’operazione è scaduta. Avviala nuovamente.`;
  if (status === 413) return `Errore (${stepLabel}): file troppo grande.`;
  if (status === 415) return `Errore (${stepLabel}): formato file non supportato.`;
  if (status === 428) return `Errore (${stepLabel}): versione dei dati mancante. Ricarica la pagina e riprova.`;
  if (status === 429) return `Errore (${stepLabel}): troppi tentativi. Attendi e riprova.`;
  if (status === 503) return `Servizio temporaneamente non disponibile (${stepLabel}). Riprova tra poco.`;

  if (isTimeoutError(error)) {
    return `Timeout durante ${stepLabel}. Verifica connessione e riprova.`;
  }

  const likelyNetworkIssue = isLikelyNetworkInfrastructureError(error);
  const likelyCors = isLikelyCorsError(error, combined);
  if (likelyNetworkIssue) {
    return buildNetworkErrorMessage(stepLabel, { likelyCors });
  }

  if (status >= 500) {
    return buildServerErrorMessage(error, stepLabel);
  }

  if (likelyCors) {
    return buildNetworkErrorMessage(stepLabel, { likelyCors: true });
  }

  if (rawMessage) return `Errore (${stepLabel}): ${rawMessage}`;
  return `Errore durante ${stepLabel}.`;
}
