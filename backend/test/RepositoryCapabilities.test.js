const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    createRequireDurableMediaLifecycle
} = require('../src/middleware/repositoryCapabilities');

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

test('JSON repositories cannot enter media flows that require durable cleanup', () => {
    const middleware = createRequireDurableMediaLifecycle({
        capabilities: { durableMediaCleanup: false }
    });
    const response = createResponse();
    let nextCalled = false;

    middleware({}, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
        success: false,
        code: 'TRANSACTIONAL_MEDIA_LIFECYCLE_REQUIRED',
        message:
            'Questa operazione media richiede METADATA_BACKEND=postgres e il cleanup R2 durevole.'
    });
});

test('Postgres repositories can enter durable media flows', () => {
    const middleware = createRequireDurableMediaLifecycle({
        capabilities: { durableMediaCleanup: true }
    });
    const response = createResponse();
    let nextCalled = false;

    middleware({}, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload, null);
});
