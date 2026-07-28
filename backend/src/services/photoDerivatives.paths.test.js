const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildPhotoAssetPaths,
    normalizePrivateSourcePathForPhotoId
} = require('./photoDerivatives');

test('keeps legacy paths stable when a photo has no media generation', () => {
    const paths = buildPhotoAssetPaths(101, 'jpg');
    assert.equal(paths.sourcePath, '/private/source/photo_101.jpg');
    assert.equal(paths.imagePath, '/uploads/photo_101.webp');
    assert.equal(paths.mobileImagePath, '/uploads/mobile/photo_101.webp');
});

test('isolates every derivative and source inside one immutable generation', () => {
    const paths = buildPhotoAssetPaths(101, 'jpg', 'generation-a');
    assert.equal(
        paths.sourcePath,
        '/private/source/generations/101/generation-a/photo.jpg'
    );
    assert.equal(
        paths.imagePath,
        '/uploads/generations/101/generation-a/photo.webp'
    );
    assert.equal(
        paths.thumbnail43Path,
        '/uploads/thumbnails/4x3/generations/101/generation-a/photo.webp'
    );
    assert.equal(
        paths.socialImagePath,
        '/uploads/social/generations/101/generation-a/photo.jpg'
    );
});

test('private source validation accepts only the requested photo generation', () => {
    const valid = '/private/source/generations/101/generation-a/photo.jpg';
    assert.equal(normalizePrivateSourcePathForPhotoId(valid, 101), valid);
    assert.equal(normalizePrivateSourcePathForPhotoId(valid, 102), '');
    assert.equal(
        normalizePrivateSourcePathForPhotoId(
            '/private/source/generations/101/../photo.jpg',
            101
        ),
        ''
    );
});
