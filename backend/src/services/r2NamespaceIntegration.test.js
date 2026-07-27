const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { env } = require('../config/env');
const {
    objectKeyToPrivatePath,
    objectKeyToUploadPath,
    privatePathToObjectKey,
    uploadPathToObjectKey
} = require('./r2Storage');
const { buildPublicAssetUrl } = require('./publicAssetUrl');
const { normalizeUploadPathToAbsoluteUrl } = require('./cloudflareCache');

const originalEnvironment = {
    r2ObjectPrefix: env.r2ObjectPrefix,
    r2PublicUrl: env.r2PublicUrl
};

afterEach(() => {
    Object.assign(env, originalEnvironment);
});

test('maps logical public and private paths into an isolated physical namespace', () => {
    env.r2ObjectPrefix = '_test/feature-database';

    assert.equal(
        uploadPathToObjectKey('/uploads/mobile/photo_1.webp'),
        '_test/feature-database/mobile/photo_1.webp'
    );
    assert.equal(
        privatePathToObjectKey('/private/source/photo_1.jpg'),
        '_test/feature-database/source/photo_1.jpg'
    );
    assert.equal(
        objectKeyToUploadPath('_test/feature-database/mobile/photo_1.webp'),
        '/uploads/mobile/photo_1.webp'
    );
    assert.equal(
        objectKeyToPrivatePath('_test/feature-database/source/photo_1.jpg'),
        '/private/source/photo_1.jpg'
    );
});

test('does not duplicate the namespace when receiving an absolute asset URL', () => {
    env.r2ObjectPrefix = '_test/feature-database';

    assert.equal(
        uploadPathToObjectKey(
            'https://uploads.example.com/_test/feature-database/photo_1.webp'
        ),
        '_test/feature-database/photo_1.webp'
    );
});

test('uses the physical namespace in public and cache-purge URLs', () => {
    env.r2ObjectPrefix = '_test/feature-database';
    env.r2PublicUrl = 'https://uploads.example.com';

    const expected = 'https://uploads.example.com/_test/feature-database/photo_1.webp';
    assert.equal(buildPublicAssetUrl('/uploads/photo_1.webp'), expected);
    assert.equal(normalizeUploadPathToAbsoluteUrl('/uploads/photo_1.webp'), expected);
});

test('preserves production paths when the namespace is empty', () => {
    env.r2ObjectPrefix = '';
    env.r2PublicUrl = 'https://uploads.example.com';

    assert.equal(uploadPathToObjectKey('/uploads/photo_1.webp'), 'photo_1.webp');
    assert.equal(
        buildPublicAssetUrl('/uploads/photo_1.webp'),
        'https://uploads.example.com/photo_1.webp'
    );
});
