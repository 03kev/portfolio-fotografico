const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    getExpectedVersion,
    repositoryOptionsFromRequest
} = require('./expectedVersion');

function request({ header, body } = {}) {
    return {
        body,
        get(name) {
            return name.toLowerCase() === 'if-match' ? header : undefined;
        }
    };
}

test('accepts quoted If-Match and forwards it as expectedVersion', () => {
    assert.deepEqual(
        repositoryOptionsFromRequest(request({ header: '"7"' })),
        { expectedVersion: 7 }
    );
});

test('accepts an expectedVersion body fallback', () => {
    assert.equal(
        getExpectedVersion(request({ body: { expectedVersion: 3 } })),
        3
    );
});

test('rejects mismatching header and body versions', () => {
    assert.throws(
        () => getExpectedVersion(request({
            header: '"3"',
            body: { expectedVersion: 4 }
        })),
        (error) => error.status === 400 && error.code === 'EXPECTED_VERSION_MISMATCH'
    );
});
