const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    getExpectedVersion,
    repositoryOptionsFromRequest
} = require('../src/utils/expectedVersion');

function request({ applicationHeader, httpHeader, body } = {}) {
    return {
        body,
        get(name) {
            if (name.toLowerCase() === 'x-expected-version') return applicationHeader;
            if (name.toLowerCase() === 'if-match') return httpHeader;
            return undefined;
        }
    };
}

test('accepts X-Expected-Version and forwards it as expectedVersion', () => {
    assert.deepEqual(
        repositoryOptionsFromRequest(request({ applicationHeader: '7' })),
        { expectedVersion: 7 }
    );
});

test('accepts quoted If-Match as a backwards-compatible fallback', () => {
    assert.equal(
        getExpectedVersion(request({ httpHeader: '"5"' })),
        5
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
            applicationHeader: '3',
            body: { expectedVersion: 4 }
        })),
        (error) => error.status === 400 && error.code === 'EXPECTED_VERSION_MISMATCH'
    );
});
