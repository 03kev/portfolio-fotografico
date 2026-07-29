const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildPhotoCreationSourcePath,
    buildPhotoAssetPaths,
    normalizePrivateSourcePathForPhotoId
} = require('../src/services/photoDerivatives');

const GENERATION = '01JGFJJZ00K4J3ZMA6VBYDT2QF';
const INTENT_ID = '10000000-0000-4000-8000-000000000001';

test('isolates a pending source under its upload intent before publication', () => {
    assert.equal(
        buildPhotoCreationSourcePath(INTENT_ID, 'jpg'),
        `/private/source/photo-creation-intents/${INTENT_ID}/source.jpg`
    );
    assert.throws(
        () => buildPhotoCreationSourcePath('not-an-intent', 'jpg'),
        /uploadIntentId/
    );
});

test('requires one valid ULID generation for every photo path', () => {
    assert.throws(
        () => buildPhotoAssetPaths(101, 'jpg'),
        /Generazione media mancante/
    );
    assert.throws(
        () => buildPhotoAssetPaths(101, 'jpg', 'generation-a'),
        /ULID/
    );
});

test('isolates every derivative and source inside one immutable generation', () => {
    const paths = buildPhotoAssetPaths(101, 'jpg', GENERATION);
    assert.equal(
        paths.sourcePath,
        `/private/source/photos/101/${GENERATION}/source.jpg`
    );
    assert.equal(
        paths.imagePath,
        `/uploads/photos/101/${GENERATION}/full.webp`
    );
    assert.equal(
        paths.mobileImagePath,
        `/uploads/photos/101/${GENERATION}/mobile.webp`
    );
    assert.equal(
        paths.thumbnail43Path,
        `/uploads/photos/101/${GENERATION}/thumbnail-4x3.webp`
    );
    assert.equal(
        paths.socialImagePath,
        `/uploads/photos/101/${GENERATION}/social.jpg`
    );
});

test('private source validation accepts only the requested photo generation', () => {
    const valid = `/private/source/photos/101/${GENERATION}/source.jpg`;
    assert.equal(normalizePrivateSourcePathForPhotoId(valid, 101), valid);
    assert.equal(normalizePrivateSourcePathForPhotoId(valid, 102), '');
    assert.equal(
        normalizePrivateSourcePathForPhotoId(
            `/private/source/photos/101/${GENERATION}/../source.jpg`,
            101
        ),
        ''
    );
});
