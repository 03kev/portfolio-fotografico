const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { readStreamToBuffer } = require('../src/utils/streams');

test('bounded stream reads stop before accumulating an oversized R2 object', async () => {
    const stream = Readable.from((async function* chunks() {
        for (const value of ['1234', '5678', 'ignored']) {
            yield Buffer.from(value);
        }
    }()));

    await assert.rejects(
        readStreamToBuffer(stream, { maxBytes: 6 }),
        (error) => (
            error.code === 'STREAM_MAX_BYTES_EXCEEDED'
            && error.maxBytes === 6
            && error.actualBytes === 8
        )
    );
});
