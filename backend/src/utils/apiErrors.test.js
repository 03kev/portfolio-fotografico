const assert = require('node:assert/strict');
const test = require('node:test');
const { VersionConflictError } = require('../repositories/errors');
const {
    createApiError,
    toApiErrorResponse
} = require('./apiErrors');

test('serializes a domain conflict with stable code and safe details', () => {
    const response = toApiErrorResponse(
        new VersionConflictError('photo', 42, 3, 4)
    );

    assert.deepEqual(response, {
        status: 409,
        payload: {
            success: false,
            message: 'photo 42 è stato modificato da un\'altra operazione.',
            code: 'VERSION_CONFLICT',
            details: {
                entity: 'photo',
                id: '42',
                expectedVersion: 3,
                actualVersion: 4
            }
        }
    });
});

test('does not expose internal server error details by default', () => {
    const error = new Error('password=secret connection refused');
    error.code = 'ECONNREFUSED';

    const response = toApiErrorResponse(error, {
        fallbackMessage: 'Errore nel recupero delle foto',
        fallbackCode: 'PHOTO_LIST_FAILED'
    });

    assert.deepEqual(response, {
        status: 500,
        payload: {
            success: false,
            message: 'Errore nel recupero delle foto',
            code: 'PHOTO_LIST_FAILED'
        }
    });
    assert.equal(JSON.stringify(response).includes('password=secret'), false);
});

test('uses an operation fallback code when an unexpected error has no code', () => {
    const response = toApiErrorResponse(new Error('query failed'), {
        fallbackMessage: 'Errore nella creazione della serie',
        fallbackCode: 'SERIES_CREATE_FAILED'
    });

    assert.equal(response.status, 500);
    assert.equal(response.payload.code, 'SERIES_CREATE_FAILED');
    assert.equal(response.payload.message, 'Errore nella creazione della serie');
});

test('createApiError creates a classified client error', () => {
    const response = toApiErrorResponse(
        createApiError('Foto non trovata', 404, 'PHOTO_NOT_FOUND')
    );

    assert.deepEqual(response, {
        status: 404,
        payload: {
            success: false,
            message: 'Foto non trovata',
            code: 'PHOTO_NOT_FOUND'
        }
    });
});
