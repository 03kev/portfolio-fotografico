const assert = require('node:assert/strict');
const { test } = require('node:test');
const sharp = require('sharp');
const {
    PHOTO_UPLOAD_ACCEPT,
    PHOTO_UPLOAD_FORMATS,
    PHOTO_UPLOAD_HINT,
    PHOTO_UPLOAD_MAX_BYTES,
    PHOTO_UPLOAD_MAX_SIZE_LABEL,
    validatePhotoUploadDeclaration
} = require('@portfolio/photo-upload-contract');
const {
    validateUploadedPhotoSourceObject
} = require('../src/services/photoUploadPolicy');

async function imageBuffer(format) {
    const pipeline = sharp({
        create: {
            width: 8,
            height: 6,
            channels: 3,
            background: { r: 120, g: 80, b: 40 }
        }
    });
    return pipeline[format]().toBuffer();
}

test('the shared declaration contract canonicalizes aliases, extensions and UI metadata', () => {
    const declaration = validatePhotoUploadDeclaration({
        contentType: 'IMAGE/JPG; charset=binary',
        fileSize: 1024
    });

    assert.equal(declaration.contentType, 'image/jpeg');
    assert.equal(declaration.extension, 'jpg');
    assert.equal(declaration.fileSize, 1024);
    assert.match(PHOTO_UPLOAD_ACCEPT, /\.jpeg/);
    assert.match(PHOTO_UPLOAD_ACCEPT, /image\/jpg/);
    assert.match(PHOTO_UPLOAD_HINT, /JPG, PNG, WebP/);
    assert.equal(PHOTO_UPLOAD_MAX_BYTES > 0, true);
    assert.match(PHOTO_UPLOAD_HINT, new RegExp(PHOTO_UPLOAD_MAX_SIZE_LABEL));
    assert.equal(new Set(PHOTO_UPLOAD_FORMATS.map((format) => format.key)).size, PHOTO_UPLOAD_FORMATS.length);
    assert.equal(PHOTO_UPLOAD_FORMATS.every((format) => (
        PHOTO_UPLOAD_ACCEPT.includes(format.canonicalMimeType)
        && PHOTO_UPLOAD_ACCEPT.includes(`.${format.preferredExtension}`)
    )), true);
});

test('the declaration contract rejects unsupported, missing and oversized files', () => {
    assert.throws(
        () => validatePhotoUploadDeclaration({
            contentType: 'application/pdf',
            fileSize: 1024
        }),
        (error) => error.code === 'INVALID_FILE_TYPE' && error.status === 415
    );
    assert.throws(
        () => validatePhotoUploadDeclaration({
            contentType: 'image/jpeg',
            fileSize: 0
        }),
        (error) => error.code === 'INVALID_FILE_SIZE' && error.status === 400
    );
    assert.throws(
        () => validatePhotoUploadDeclaration({
            contentType: 'image/jpeg',
            fileSize: PHOTO_UPLOAD_MAX_BYTES + 1
        }),
        (error) => error.code === 'LIMIT_FILE_SIZE' && error.status === 413
    );
});

test('the server recognizes the actual bytes and accepts the intentional JPG alias', async () => {
    const buffer = await imageBuffer('jpeg');
    const validated = await validateUploadedPhotoSourceObject({
        buffer,
        contentType: 'image/jpg',
        contentLength: buffer.length
    }, {
        expectedContentType: 'image/jpeg'
    });

    assert.equal(validated.contentType, 'image/jpeg');
    assert.equal(validated.extension, 'jpg');
    assert.equal(validated.format, 'jpeg');
    assert.equal(validated.byteLength, buffer.length);
});

test('false MIME declarations and storage headers cannot publish different bytes', async () => {
    const jpeg = await imageBuffer('jpeg');

    await assert.rejects(
        validateUploadedPhotoSourceObject({
            buffer: jpeg,
            contentType: 'image/png',
            contentLength: jpeg.length
        }, {
            expectedContentType: 'image/png'
        }),
        (error) => error.code === 'PHOTO_SOURCE_FORMAT_MISMATCH' && error.status === 415
    );

    await assert.rejects(
        validateUploadedPhotoSourceObject({
            buffer: jpeg,
            contentType: 'image/png',
            contentLength: jpeg.length
        }, {
            expectedContentType: 'image/jpeg'
        }),
        (error) => (
            error.code === 'PHOTO_SOURCE_CONTENT_TYPE_MISMATCH'
            && error.status === 415
        )
    );
});

test('actual byte limits, incomplete objects and unsupported decoded formats fail closed', async () => {
    const png = await imageBuffer('png');
    const gif = await imageBuffer('gif');

    await assert.rejects(
        validateUploadedPhotoSourceObject({
            buffer: png,
            contentType: 'image/png',
            contentLength: png.length
        }, {
            expectedContentType: 'image/png',
            maxBytes: png.length - 1
        }),
        (error) => error.code === 'PHOTO_SOURCE_TOO_LARGE' && error.status === 413
    );
    await assert.rejects(
        validateUploadedPhotoSourceObject({
            buffer: Buffer.from('not-an-image'),
            contentType: 'image/jpeg',
            contentLength: 12
        }, {
            expectedContentType: 'image/jpeg'
        }),
        (error) => error.code === 'PHOTO_SOURCE_INVALID' && error.status === 422
    );
    await assert.rejects(
        validateUploadedPhotoSourceObject({
            buffer: gif,
            contentType: 'image/jpeg',
            contentLength: gif.length
        }, {
            expectedContentType: 'image/jpeg'
        }),
        (error) => error.code === 'PHOTO_SOURCE_FORMAT_UNSUPPORTED' && error.status === 415
    );
});
