const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createMediaGeneration,
    normalizeMediaGeneration
} = require('../src/utils/mediaGeneration');

test('creates lexicographically ordered ULIDs within the same millisecond', () => {
    const timestamp = 1_785_193_200_000;
    const first = createMediaGeneration(timestamp);
    const second = createMediaGeneration(timestamp);

    assert.match(first, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.match(second, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.ok(second > first);
});

test('normalizes valid ULIDs and rejects ad-hoc generation strings', () => {
    const generation = createMediaGeneration();
    assert.equal(normalizeMediaGeneration(generation.toLowerCase()), generation);
    assert.throws(
        () => normalizeMediaGeneration('v2-a1b2c3', { required: true }),
        /ULID/
    );
    assert.throws(
        () => normalizeMediaGeneration('', { required: true }),
        /mancante/
    );
});
