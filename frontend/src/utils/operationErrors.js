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

const GENERIC_SERVER_MESSAGE_PATTERNS = [
  /^errore del server$/i,
  /^errore interno del server$/i,
  /^internal server error$/i,
  /^request failed with status code 5\d\d$/i,
  /^errore durante/i,
  /^errore nell['’]/i
];

const isMatchingPattern = (message, patterns) => patterns.some((pattern) => pattern.test(message));

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

export function isTimeoutError(error) {
  const rawMessage = compactRawMessage(error?.message || error?.error?.message || error?.data?.message || '');
  return isMatchingPattern(rawMessage, TIMEOUT_ERROR_PATTERNS);
}

export function isNetworkError(error) {
  const rawMessage = compactRawMessage(error?.message || error?.error?.message || error?.data?.message || '');
  return isMatchingPattern(rawMessage, NETWORK_ERROR_PATTERNS);
}

function isGenericServerMessage(message) {
  const raw = compactRawMessage(message);
  if (!raw) return true;
  return isMatchingPattern(raw, GENERIC_SERVER_MESSAGE_PATTERNS);
}

function buildServerErrorMessage(error, stepLabel) {
  const rawMessage = compactRawMessage(error?.message || error?.error?.message || error?.data?.message || '');
  const detailMessage = compactRawMessage(
    error?.details?.message
    || error?.details?.reason
    || error?.details?.detail
    || ''
  );

  const meaningful = [rawMessage, detailMessage].find((entry) => entry && !isGenericServerMessage(entry));
  if (meaningful) {
    return `Errore server (${stepLabel}): ${meaningful}`;
  }
  return `Errore server (${stepLabel}): riprova tra poco.`;
}

export function buildOperationErrorMessage(error, stepLabel = 'operazione') {
  const rawMessage = compactRawMessage(error?.message || error?.error?.message || error?.data?.message || '');
  const status = getHttpStatusFromError(error);

  if (status === 400) return `Errore (${stepLabel}): richiesta non valida. ${rawMessage || ''}`.trim();
  if (status === 401) return `Errore (${stepLabel}): autenticazione richiesta. Riapri la sessione admin.`;
  if (status === 403) return `Errore (${stepLabel}): accesso negato. Verifica token/API o permessi bucket.`;
  if (status === 404) return `Errore (${stepLabel}): risorsa non trovata.`;
  if (status === 409) return `Errore (${stepLabel}): conflitto dati, aggiorna e riprova.`;
  if (status === 413) return `Errore (${stepLabel}): file troppo grande.`;
  if (status === 415) return `Errore (${stepLabel}): formato file non supportato.`;
  if (status === 503) return `Servizio temporaneamente non disponibile (${stepLabel}). Riprova tra poco.`;
  if (status >= 500) return buildServerErrorMessage(error, stepLabel);

  if (isTimeoutError(error)) {
    return `Timeout durante ${stepLabel}. Verifica connessione e riprova.`;
  }

  if (isBrowserOffline()) {
    return `Operazione non riuscita (${stepLabel}): nessuna connessione Internet.`;
  }

  if (isNetworkError(error)) {
    return `Errore di rete durante ${stepLabel}.`;
  }

  if (rawMessage) return `Errore (${stepLabel}): ${rawMessage}`;
  return `Errore durante ${stepLabel}.`;
}

export function buildSignedUploadErrorMessage(error, stepLabel = 'upload file su R2') {
  if (isBrowserOffline() || Boolean(error?.offline)) {
    return 'Upload non riuscito: nessuna connessione Internet.';
  }

  if (isNetworkError(error) && Boolean(error?.likelyCors)) {
    return 'Upload non riuscito: probabile problema CORS verso R2. Verifica la configurazione CORS del bucket privato.';
  }

  if (isNetworkError(error)) {
    return 'Upload non riuscito: problema di rete. Riprova e verifica la connessione.';
  }

  return buildOperationErrorMessage(error, stepLabel);
}
