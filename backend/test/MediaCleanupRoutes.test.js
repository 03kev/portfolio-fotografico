const assert = require('node:assert/strict');
const express = require('express');
const { afterEach, test } = require('node:test');
const { env } = require('../src/config/env');
const mediaCleanupRoutes = require('../src/routes/mediaCleanup');

const originalEnvironment = { ...env };

afterEach(() => {
    Object.assign(env, originalEnvironment);
});

async function withServer(callback) {
    const app = express();
    app.use(express.json());
    app.use('/media-cleanup', mediaCleanupRoutes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        const { port } = server.address();
        await callback(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

test('manual cleanup honors METADATA_WRITES_ENABLED after concealed admin auth', async () => {
    Object.assign(env, {
        metadataWritesEnabled: false,
        apiWriteToken: 'test-write-token',
        apiWriteTokenHash: '',
        isProduction: false
    });

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/media-cleanup/run`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': 'test-write-token'
            },
            body: '{}'
        });
        const body = await response.json();

        assert.equal(response.status, 503);
        assert.equal(body.code, 'METADATA_READ_ONLY');
    });
});
