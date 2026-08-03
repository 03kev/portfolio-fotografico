const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildPhotoCreationSourcePath,
    materializePhotoAssets,
    normalizePrivateSourcePathForPhotoId,
    PHOTO_ASSET_REPLACEMENT_GROUPS
} = require('../src/services/photoDerivatives');
const { presentPhoto } = require('../src/routes/photos.helpers');

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
        () => materializePhotoAssets(101, null, [{
            role: 'source', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE,
            scope: 'private', fileName: 'source.jpg', contentType: 'image/jpeg'
        }]),
        /Generazione media mancante/
    );
    assert.throws(
        () => materializePhotoAssets(101, 'generation-a', [{
            role: 'source', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE,
            scope: 'private', fileName: 'source.jpg', contentType: 'image/jpeg'
        }]),
        /ULID/
    );
});

test('isolates every derivative and source inside one immutable generation', () => {
    const paths = Object.fromEntries(materializePhotoAssets(101, GENERATION, [
        { role: 'source', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE, scope: 'private', fileName: 'source.jpg', contentType: 'image/jpeg' },
        { role: 'full', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'full.webp', contentType: 'image/webp' },
        { role: 'mobile', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'mobile.webp', contentType: 'image/webp' },
        { role: 'thumbnail-4x3', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'thumbnail-4x3.webp', contentType: 'image/webp' },
        { role: 'social', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'social.jpg', contentType: 'image/jpeg' }
    ]).map((asset) => [asset.role, asset.path]));
    assert.equal(
        paths.source,
        `/private/source/photos/101/${GENERATION}/source.jpg`
    );
    assert.equal(
        paths.full,
        `/uploads/photos/101/${GENERATION}/full.webp`
    );
    assert.equal(
        paths.mobile,
        `/uploads/photos/101/${GENERATION}/mobile.webp`
    );
    assert.equal(
        paths['thumbnail-4x3'],
        `/uploads/photos/101/${GENERATION}/thumbnail-4x3.webp`
    );
    assert.equal(
        paths.social,
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

test('API projection exposes registered public roles without a fixed variant list', () => {
    const presented = presentPhoto({
        id: 101,
        title: 'Variant test',
        assets: [
            {
                role: 'panorama-preview',
                scope: 'public',
                path: `/uploads/photos/101/${GENERATION}/panorama-preview.avif`,
                contentType: 'image/avif',
                generation: GENERATION
            },
            {
                role: 'source',
                scope: 'private',
                path: `/private/source/photos/101/${GENERATION}/source.jpg`,
                contentType: 'image/jpeg',
                generation: GENERATION
            }
        ]
    });

    assert.equal(
        presented.assets['panorama-preview'].url,
        `/uploads/photos/101/${GENERATION}/panorama-preview.avif`
    );
    assert.equal(presented.assets.source, undefined);
});
