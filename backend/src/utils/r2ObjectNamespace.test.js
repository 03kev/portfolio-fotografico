const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    isValidR2ObjectPrefix,
    namespaceObjectKey,
    normalizeR2ObjectPrefix,
    stripObjectNamespace
} = require('./r2ObjectNamespace');

test('normalizes and applies an R2 namespace exactly once', () => {
    const prefix = normalizeR2ObjectPrefix('/_test/feature-database/');

    assert.equal(prefix, '_test/feature-database');
    assert.equal(
        namespaceObjectKey('mobile/photo_1.webp', prefix),
        '_test/feature-database/mobile/photo_1.webp'
    );
    assert.equal(
        namespaceObjectKey('_test/feature-database/mobile/photo_1.webp', prefix),
        '_test/feature-database/mobile/photo_1.webp'
    );
});

test('strips only the configured namespace boundary', () => {
    assert.equal(
        stripObjectNamespace(
            '_test/feature-database/photo_1.webp',
            '_test/feature-database'
        ),
        'photo_1.webp'
    );
    assert.equal(
        stripObjectNamespace(
            '_test/feature-database-other/photo_1.webp',
            '_test/feature-database'
        ),
        '_test/feature-database-other/photo_1.webp'
    );
});

test('rejects unsafe or ambiguous R2 namespace segments', () => {
    assert.equal(isValidR2ObjectPrefix('_test/feature-database'), true);
    assert.equal(isValidR2ObjectPrefix('../production'), false);
    assert.equal(isValidR2ObjectPrefix('test//assets'), false);
    assert.equal(isValidR2ObjectPrefix('test assets'), false);
});
