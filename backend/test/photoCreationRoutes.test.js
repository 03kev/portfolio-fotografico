const assert = require('node:assert/strict');
const express = require('express');
const { test } = require('node:test');
const {
    createPhotoCreationRouter
} = require('../src/routes/photoCreationRoutes');

async function withServer(getPhotoCreationService, callback) {
    const app = express();
    app.use(express.json());
    app.use('/photos', createPhotoCreationRouter({ getPhotoCreationService }));
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

test('JSON mode exposes the transactional upload requirement over HTTP', async () => {
    const unsupported = new Error(
        'La creazione di nuove foto richiede METADATA_BACKEND=postgres.'
    );
    unsupported.status = 503;
    unsupported.code = 'TRANSACTIONAL_PHOTO_CREATION_REQUIRED';

    await withServer(() => {
        throw unsupported;
    }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/photos/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uploadIntentId: '10000000-0000-4000-8000-000000000001',
                variant: 'source',
                mimetype: 'image/jpeg',
                fileSize: 1024
            })
        });
        const body = await response.json();

        assert.equal(response.status, 503);
        assert.equal(body.success, false);
        assert.equal(body.code, 'TRANSACTIONAL_PHOTO_CREATION_REQUIRED');
    });
});
