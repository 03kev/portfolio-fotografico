import {
  buildOperationErrorMessage,
  getErrorCodeFromError,
  isAmbiguousMutationError,
  isConcurrencyError
} from './operationErrors';

describe('operationErrors', () => {
  test('uses stable backend codes for actionable conflict messages', () => {
    const message = buildOperationErrorMessage({
      status: 409,
      code: 'VERSION_CONFLICT',
      details: {
        expectedVersion: 2,
        actualVersion: 3
      }
    }, 'aggiornamento foto');

    expect(message).toContain('modificato da un’altra operazione');
    expect(message).toContain('verifica e riprova');
  });

  test('distinguishes an active media mutation from a generic conflict', () => {
    const message = buildOperationErrorMessage({
      status: 409,
      code: 'PHOTO_MUTATION_IN_PROGRESS'
    }, 'reupload source');

    expect(message).toContain('già in corso un’operazione sui file');
  });

  test('provides a precise authentication rate-limit message', () => {
    const message = buildOperationErrorMessage({
      status: 429,
      code: 'AUTH_RATE_LIMITED'
    }, 'accesso admin');

    expect(message).toContain('Troppi tentativi di accesso');
  });

  test('recognizes nested error codes returned by API clients', () => {
    expect(getErrorCodeFromError({
      response: { data: { code: 'series_title_conflict' } }
    })).toBe('SERIES_TITLE_CONFLICT');
  });

  test('classifies version errors and ambiguous mutation outcomes', () => {
    expect(isConcurrencyError({ status: 428 })).toBe(true);
    expect(isConcurrencyError({ code: 'MEDIA_OPERATION_STALE' })).toBe(true);
    expect(isAmbiguousMutationError({ status: 503 })).toBe(true);
    expect(isAmbiguousMutationError({ status: 400 })).toBe(false);
  });

  test('does not mistake a normal use of the word origin for CORS', () => {
    const message = buildOperationErrorMessage(
      { status: 500, message: 'Errore origine dati' },
      'salvataggio'
    );

    expect(message).not.toContain('CORS');
  });

  test('preserves a message already prepared for the user', () => {
    expect(buildOperationErrorMessage({
      userMessage: 'Messaggio pronto.'
    }, 'operazione')).toBe('Messaggio pronto.');
  });

  test('warns before retrying when a mutation outcome cannot be verified', () => {
    const message = buildOperationErrorMessage({
      status: 503,
      outcomeUnknown: true
    }, 'eliminazione foto');

    expect(message).toContain('Esito non verificabile');
    expect(message).toContain('controlla il risultato prima di riprovare');
  });
});
