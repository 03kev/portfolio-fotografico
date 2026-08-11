const assert = require('node:assert/strict');
const test = require('node:test');
const { getPhotoMetadataField } = require('@portfolio/photo-metadata-contract');
const {
    sanitizePhotoPayload,
    sanitizeSeriesPayload
} = require('../src/utils/inputSanitizers');

test('classifies field length errors with stable validation details', () => {
    const maximum = getPhotoMetadataField('title').limits.maxLength;
    assert.throws(
        () => sanitizePhotoPayload({
            title: 'x'.repeat(maximum + 1)
        }, { partial: true }),
        (error) => (
            error.status === 400
            && error.code === 'VALIDATION_ERROR'
            && error.details.field === 'title'
            && error.details.maximumLength === maximum
        )
    );
});

test('rejects photo titles shorter than the database constraint before persistence', () => {
    const minimum = getPhotoMetadataField('title').limits.minLength;
    assert.throws(
        () => sanitizePhotoPayload({
            title: 'x'
        }, { partial: true }),
        (error) => (
            error.status === 400
            && error.code === 'VALIDATION_ERROR'
            && error.details.field === 'title'
            && error.details.minimumLength === minimum
        )
    );
});

test('classifies missing series fields without leaking implementation details', () => {
    assert.throws(
        () => sanitizeSeriesPayload({
            title: 'Titolo valido',
            description: ''
        }),
        (error) => (
            error.status === 400
            && error.code === 'VALIDATION_ERROR'
            && error.details.field === 'description'
        )
    );
});
