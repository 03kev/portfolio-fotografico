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

const originalEnvironment = {
    r2ObjectPrefix: env.r2ObjectPrefix,
    r2PublicUrl: env.r2PublicUrl
};
const GENERATION = '01JGFJJZ00XR5RF7YH2J5PVWBX';

afterEach(() => {
    Object.assign(env, originalEnvironment);
});

test('maps logical public and private paths into an isolated physical namespace', () => {
    env.r2ObjectPrefix = '_test/feature-database';

    assert.equal(
        uploadPathToObjectKey(`/uploads/photos/1/${GENERATION}/mobile.webp`),
        `_test/feature-database/photos/1/${GENERATION}/mobile.webp`
    );
    assert.equal(
        privatePathToObjectKey(`/private/source/photos/1/${GENERATION}/source.jpg`),
        `_test/feature-database/source/photos/1/${GENERATION}/source.jpg`
    );
    assert.equal(
        objectKeyToUploadPath(`_test/feature-database/photos/1/${GENERATION}/mobile.webp`),
        `/uploads/photos/1/${GENERATION}/mobile.webp`
    );
    assert.equal(
        objectKeyToPrivatePath(`_test/feature-database/source/photos/1/${GENERATION}/source.jpg`),
        `/private/source/photos/1/${GENERATION}/source.jpg`
    );
});

test('does not duplicate the namespace when receiving an absolute asset URL', () => {
    env.r2ObjectPrefix = '_test/feature-database';

    assert.equal(
        uploadPathToObjectKey(
            `https://uploads.example.com/_test/feature-database/photos/1/${GENERATION}/full.webp`
        ),
        `_test/feature-database/photos/1/${GENERATION}/full.webp`
    );
});

test('uses the physical namespace in public asset URLs', () => {
    env.r2ObjectPrefix = '_test/feature-database';
    env.r2PublicUrl = 'https://uploads.example.com';

    const expected = `https://uploads.example.com/_test/feature-database/photos/1/${GENERATION}/full.webp`;
    assert.equal(buildPublicAssetUrl(`/uploads/photos/1/${GENERATION}/full.webp`), expected);
});

test('preserves production paths when the namespace is empty', () => {
    env.r2ObjectPrefix = '';
    env.r2PublicUrl = 'https://uploads.example.com';

    const logicalPath = `/uploads/photos/1/${GENERATION}/full.webp`;
    assert.equal(
        uploadPathToObjectKey(logicalPath),
        `photos/1/${GENERATION}/full.webp`
    );
    assert.equal(
        buildPublicAssetUrl(logicalPath),
        `https://uploads.example.com/photos/1/${GENERATION}/full.webp`
    );
});
