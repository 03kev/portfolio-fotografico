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
  /preflight/i,
  /origin/i
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

export function buildOperationErrorMessage(error, stepLabel = 'operazione') {
  const { rawMessage, combined } = getErrorMessages(error);
  const status = getHttpStatusFromError(error);

  if (isBrowserOffline() || Boolean(error?.offline)) {
    return `Operazione non riuscita (${stepLabel}): nessuna connessione Internet.`;
  }

  if (status === 400) return `Errore (${stepLabel}): richiesta non valida. ${rawMessage || ''}`.trim();
  if (status === 401) return `Errore (${stepLabel}): autenticazione richiesta. Riapri la sessione admin.`;
  if (status === 403) return `Errore (${stepLabel}): accesso negato. Verifica token/API o permessi bucket.`;
  if (status === 404) return `Errore (${stepLabel}): risorsa non trovata.`;
  if (status === 409) return `Errore (${stepLabel}): conflitto dati, aggiorna e riprova.`;
  if (status === 413) return `Errore (${stepLabel}): file troppo grande.`;
  if (status === 415) return `Errore (${stepLabel}): formato file non supportato.`;
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
