const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const {
    DEFAULT_CROP_PROFILE,
    PHOTO_CROP_PRESETS,
    createPhotoCropPresetCatalog,
    findPhotoCropPreset,
    normalizeCropProfiles
} = require('@portfolio/photo-crop-contract');
const {
    PHOTO_DERIVATIVE_VARIANTS,
    definePhotoDerivativeVariant,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    mergePhotoSettingsForStorage,
    normalizeCropProfilesForStorage
} = require('../src/services/photoDerivatives');

const SOURCE = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100">'
    + '<rect width="160" height="100" fill="#c9aa63"/>'
    + '</svg>'
);

test('frontend presets and Sharp variants share one validated crop contract', () => {
    const presetKeys = new Set(PHOTO_CROP_PRESETS.map((preset) => preset.key));
    const cropped = PHOTO_DERIVATIVE_VARIANTS.filter((variant) => variant.cropPresetKey);
    const uncropped = PHOTO_DERIVATIVE_VARIANTS.filter((variant) => !variant.cropPresetKey);

    assert.deepEqual(
        cropped.map((variant) => variant.cropPresetKey).sort(),
        ['r11', 'r43', 'social']
    );
    for (const variant of cropped) {
        const preset = findPhotoCropPreset(variant.cropPresetKey);
        assert.equal(presetKeys.has(variant.cropPresetKey), true);
        assert.equal(variant.outputWidth / variant.outputHeight, preset.ratioValue);
    }
    assert.deepEqual(
        uncropped.map((variant) => variant.role).sort(),
        ['full', 'mobile']
    );
});

test('a new preset drives validation and Sharp production without key-specific code', async () => {
    const presets = createPhotoCropPresetCatalog([
        ...PHOTO_CROP_PRESETS,
        {
            key: 'panorama',
            label: 'Panorama 2:1',
            shortLabel: '2:1',
            width: 2,
            height: 1
        }
    ]);
    const panorama = definePhotoDerivativeVariant({
        role: 'panorama-preview',
        scope: 'public',
        fileName: 'panorama-preview.webp',
        contentType: 'image/webp',
        cropPresetKey: 'panorama',
        outputWidth: 80,
        outputHeight: 40,
        encode: (pipeline) => pipeline.webp().toBuffer()
    }, { cropPresets: presets });

    const result = await generatePhotoDerivatives(
        SOURCE,
        { panorama: { x: 0.25, y: 0.5, scale: 1.5 } },
        [panorama],
        { cropPresets: presets }
    );
    const metadata = await sharp(result.assets[0].buffer).metadata();

    assert.equal(result.assets[0].role, 'panorama-preview');
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 40);
});

test('a variant may reuse an existing preset or opt out of crop entirely', async () => {
    const square = definePhotoDerivativeVariant({
        role: 'small-square',
        scope: 'public',
        fileName: 'small-square.webp',
        contentType: 'image/webp',
        cropPresetKey: 'r11',
        outputWidth: 32,
        outputHeight: 32,
        encode: (pipeline) => pipeline.webp().toBuffer()
    });
    let uncroppedProducerCalled = false;
    const uncropped = definePhotoDerivativeVariant({
        role: 'source-preview',
        scope: 'public',
        fileName: 'source-preview.webp',
        contentType: 'image/webp',
        produce: ({ base }) => {
            uncroppedProducerCalled = true;
            return base.clone().resize(24, 16).webp().toBuffer();
        }
    });

    const result = await generatePhotoDerivatives(SOURCE, null, [square, uncropped]);
    const dimensions = await Promise.all(
        result.assets.map((asset) => sharp(asset.buffer).metadata())
    );

    assert.deepEqual(
        dimensions.map(({ width, height }) => [width, height]),
        [[32, 32], [24, 16]]
    );
    assert.equal(uncroppedProducerCalled, true);
});

test('missing and incoherent crop presets fail before derivative production', () => {
    assert.throws(
        () => definePhotoDerivativeVariant({
            role: 'missing-preset',
            scope: 'public',
            fileName: 'missing.webp',
            contentType: 'image/webp',
            cropPresetKey: 'missing',
            outputWidth: 40,
            outputHeight: 30,
            encode: (pipeline) => pipeline.webp().toBuffer()
        }),
        /preset crop inesistente/
    );
    assert.throws(
        () => definePhotoDerivativeVariant({
            role: 'wrong-ratio',
            scope: 'public',
            fileName: 'wrong.webp',
            contentType: 'image/webp',
            cropPresetKey: 'r11',
            outputWidth: 40,
            outputHeight: 30,
            encode: (pipeline) => pipeline.webp().toBuffer()
        }),
        /rapporto.*non coincide/
    );
    assert.throws(
        () => createPhotoCropPresetCatalog([{
            key: 'invalid',
            label: 'Invalid',
            shortLabel: 'X',
            width: 0,
            height: 1
        }]),
        /preset crop non valida/
    );
});

test('saved profiles round-trip while removed historical keys remain uninterpreted', () => {
    const saved = {
        r43: { x: 0.2, y: 0.7, scale: 1.25 },
        r11: { x: 0.8, y: 0.3, scale: 2 },
        social: { x: 0.4, y: 0.6, scale: 1 },
        retiredPreset: { x: 0.123456, y: 0.654321, scale: 3.75, note: 'legacy' }
    };

    const stored = normalizeCropProfilesForStorage({ cropProfiles: saved });
    assert.deepEqual(stored, saved);
    assert.deepEqual(
        normalizeCropProfiles(stored, {
            includeDefaults: true,
            preserveUnknown: true
        }),
        saved
    );
    assert.deepEqual(getCropProfilesFromSettings({ cropProfiles: stored }), {
        r43: saved.r43,
        r11: saved.r11,
        social: saved.social
    });
    assert.equal(
        Object.hasOwn(getCropProfilesFromSettings({ cropProfiles: stored }), 'retiredPreset'),
        false
    );
});

test('invalid known profiles use the shared default without changing unknown history', () => {
    const historical = { x: 'kept', y: null, scale: 99 };
    const normalized = normalizeCropProfilesForStorage({
        cropProfiles: {
            r43: { x: 'invalid', y: 0.5, scale: 1 },
            historical
        }
    });

    assert.deepEqual(normalized.r43, DEFAULT_CROP_PROFILE);
    assert.equal(normalized.historical, historical);
});

test('generic settings patches that do not touch crop preserve profiles and other settings', () => {
    const cropProfiles = {
        r43: { x: 0.2, y: 0.7, scale: 1.25 },
        retiredPreset: { x: 'historical', note: 'do not reinterpret' }
    };
    const merged = mergePhotoSettingsForStorage({
        aperture: 'f/2.8',
        cropProfiles
    }, {
        iso: '200'
    });

    assert.deepEqual(merged, {
        aperture: 'f/2.8',
        iso: '200',
        cropProfiles
    });
});

test('generic settings patches normalize incomplete current profiles and retain historical presets', () => {
    const historical = { x: 'legacy', custom: true };
    const merged = mergePhotoSettingsForStorage({
        aperture: 'f/4',
        cropProfiles: {
            retiredPreset: historical,
            r11: { x: 0.1, y: 0.2, scale: 1.5 }
        }
    }, {
        shutter: '1/250s',
        cropProfiles: {
            r43: { x: 'invalid', y: 0.5, scale: 1 },
            futurePreset: { x: 0.12, y: 0.34, scale: 2, note: 'unknown' }
        }
    });

    assert.equal(merged.aperture, 'f/4');
    assert.equal(merged.shutter, '1/250s');
    assert.deepEqual(merged.cropProfiles, {
        retiredPreset: historical,
        futurePreset: { x: 0.12, y: 0.34, scale: 2, note: 'unknown' },
        r43: DEFAULT_CROP_PROFILE,
        r11: DEFAULT_CROP_PROFILE,
        social: DEFAULT_CROP_PROFILE
    });
});
