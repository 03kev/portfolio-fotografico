const assert = require('node:assert/strict');
const test = require('node:test');
const {
    sanitizePhotoPayload,
    sanitizeSeriesPayload
} = require('./inputSanitizers');

test('classifies field length errors with stable validation details', () => {
    assert.throws(
        () => sanitizePhotoPayload({
            title: 'x'.repeat(121)
        }, { partial: true }),
        (error) => (
            error.status === 400
            && error.code === 'VALIDATION_ERROR'
            && error.details.field === 'title'
            && error.details.maximumLength === 120
        )
    );
});

test('rejects photo titles shorter than the database constraint before persistence', () => {
    assert.throws(
        () => sanitizePhotoPayload({
            title: 'x'
        }, { partial: true }),
        (error) => (
            error.status === 400
            && error.code === 'VALIDATION_ERROR'
            && error.details.field === 'title'
            && error.details.minimumLength === 3
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
