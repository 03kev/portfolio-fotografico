const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { env, validateEnv } = require('../src/config/env');

const originalEnvironment = { ...env };

afterEach(() => {
    Object.assign(env, originalEnvironment);
});

function configureValidPreviewEnvironment() {
    Object.assign(env, {
        isDevelopment: false,
        isProduction: true,
        vercelEnv: 'preview',
        siteUrl: 'https://preview.example.com',
        metadataBackend: 'postgres',
        metadataWritesEnabled: true,
        databaseUrl: 'postgresql://example.invalid/neondb',
        corsOrigins: ['https://preview.example.com'],
        apiWriteToken: '',
        apiWriteTokenHash: 'scrypt$test',
        apiSessionSecret: 'test-session-secret',
        r2AccountId: 'account',
        r2AccessKeyId: 'access-key',
        r2SecretAccessKey: 'secret-key',
        r2Bucket: 'public-assets',
        r2PrivateBucket: 'private-assets',
        r2PublicUrl: 'https://uploads.example.com',
        r2ObjectPrefix: ''
    });
}

test('rejects write-enabled Vercel previews without an R2 namespace', () => {
    configureValidPreviewEnvironment();

    assert.throws(
        () => validateEnv(),
        /Preview con scritture abilitate richiedono R2_OBJECT_PREFIX/
    );
});

test('accepts an isolated namespace for write-enabled Vercel previews', () => {
    configureValidPreviewEnvironment();
    env.r2ObjectPrefix = '_test/feature-database';

    assert.doesNotThrow(() => validateEnv());
});

test('allows read-only Vercel previews without an R2 namespace', () => {
    configureValidPreviewEnvironment();
    env.metadataWritesEnabled = false;

    assert.doesNotThrow(() => validateEnv());
});
