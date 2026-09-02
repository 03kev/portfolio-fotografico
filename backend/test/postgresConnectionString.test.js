const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');

test('upgrades Neon sslmode=require to explicit certificate and hostname verification', () => {
    const normalized = normalizePostgresConnectionString(
        'postgresql://user:secret@example.neon.tech/neondb?sslmode=require&channel_binding=require'
    );
    const url = new URL(normalized);

    assert.equal(url.searchParams.get('sslmode'), 'verify-full');
    assert.equal(url.searchParams.get('channel_binding'), 'require');
});

test('preserves an explicit verify-full connection string', () => {
    const value = 'postgresql://user:secret@example.neon.tech/neondb?sslmode=verify-full';
    assert.equal(normalizePostgresConnectionString(value), value);
});

test('leaves non-URL values untouched so the driver can report the configuration error', () => {
    assert.equal(normalizePostgresConnectionString('invalid'), 'invalid');
});
