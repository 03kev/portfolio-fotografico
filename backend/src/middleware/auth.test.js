const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { env } = require('../config/env');
const { protectWriteMethods } = require('./auth');

const originalMetadataWritesEnabled = env.metadataWritesEnabled;

afterEach(() => {
    env.metadataWritesEnabled = originalMetadataWritesEnabled;
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
