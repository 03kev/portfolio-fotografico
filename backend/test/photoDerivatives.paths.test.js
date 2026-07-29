const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildPhotoAssetPaths,
    normalizePrivateSourcePathForPhotoId
} = require('../src/services/photoDerivatives');

const GENERATION = '01JGFJJZ00K4J3ZMA6VBYDT2QF';

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
