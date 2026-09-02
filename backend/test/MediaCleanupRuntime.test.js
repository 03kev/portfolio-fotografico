const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    getMediaCleanupExecutionBlock
} = require('../src/services/mediaCleanupRuntime');

const postgresCapabilities = Object.freeze({
    durableMediaCleanup: true
});

test('a read-only Preview cannot execute cleanup in the production namespace', () => {
    const block = getMediaCleanupExecutionBlock({
        capabilities: postgresCapabilities,
        metadataWritesEnabled: false,
        vercelEnv: 'preview',
        namespace: ''
    });

    assert.equal(block.code, 'METADATA_READ_ONLY');
});

test('a writable Preview requires a non-empty isolated cleanup namespace', () => {
    const block = getMediaCleanupExecutionBlock({
        capabilities: postgresCapabilities,
        metadataWritesEnabled: true,
        vercelEnv: 'preview',
        namespace: ''
    });

    assert.equal(block.code, 'MEDIA_CLEANUP_NAMESPACE_REQUIRED');
});

test('production may intentionally use the root R2 namespace', () => {
    const block = getMediaCleanupExecutionBlock({
        capabilities: postgresCapabilities,
        metadataWritesEnabled: true,
        vercelEnv: 'production',
        namespace: ''
    });

    assert.equal(block, null);
});

test('JSON cannot initialize the cleanup executor', () => {
    const block = getMediaCleanupExecutionBlock({
        capabilities: { durableMediaCleanup: false },
        metadataWritesEnabled: true,
        vercelEnv: 'production',
        namespace: ''
    });

    assert.equal(block.code, 'DURABLE_MEDIA_CLEANUP_REQUIRED');
});
