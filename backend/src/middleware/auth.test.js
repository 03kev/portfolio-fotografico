const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { env } = require('../config/env');
const {
    protectWriteMethods,
    requireConcealedAdminAuth
} = require('./auth');

const originalMetadataWritesEnabled = env.metadataWritesEnabled;
const originalApiWriteToken = env.apiWriteToken;
const originalApiWriteTokenHash = env.apiWriteTokenHash;
const originalIsProduction = env.isProduction;

afterEach(() => {
    env.metadataWritesEnabled = originalMetadataWritesEnabled;
    env.apiWriteToken = originalApiWriteToken;
    env.apiWriteTokenHash = originalApiWriteTokenHash;
    env.isProduction = originalIsProduction;
});

function createResponse() {
    return {
        statusCode: 200,
        payload: null,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
}

test('read-only metadata mode still permits safe methods', () => {
    env.metadataWritesEnabled = false;
    const response = createResponse();
    let nextCalled = false;

    protectWriteMethods({ method: 'GET' }, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload, null);
});

test('read-only metadata mode rejects mutations before authentication', () => {
    env.metadataWritesEnabled = false;
    const response = createResponse();
    let nextCalled = false;

    protectWriteMethods({ method: 'POST' }, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
        success: false,
        code: 'METADATA_READ_ONLY',
        message: 'Le modifiche ai contenuti sono temporaneamente disabilitate.'
    });
});

test('concealed admin routes return 404 to unauthenticated requests', () => {
    env.apiWriteToken = 'test-write-token';
    env.apiWriteTokenHash = '';
    env.isProduction = false;
    const response = createResponse();
    let nextCalled = false;

    requireConcealedAdminAuth({ headers: {} }, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.payload, {
        success: false,
        message: 'Endpoint non trovato'
    });
});

test('concealed admin routes allow an authenticated request', () => {
    env.apiWriteToken = 'test-write-token';
    env.apiWriteTokenHash = '';
    env.isProduction = false;
    const response = createResponse();
    let nextCalled = false;

    requireConcealedAdminAuth({
        headers: {
            'x-api-key': 'test-write-token'
        }
    }, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload, null);
});
