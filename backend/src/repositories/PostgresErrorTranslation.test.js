const assert = require('node:assert/strict');
const test = require('node:test');
const {
    translatePostgresError
} = require('./PostgresPortfolioRepository');

test('translates known check constraints into actionable validation errors', () => {
    const translated = translatePostgresError({
        code: '23514',
        constraint: 'photos_title_check'
    });

    assert.equal(translated.status, 400);
    assert.equal(translated.code, 'CHECK_CONSTRAINT_VIOLATION');
    assert.equal(
        translated.message,
        'Il titolo della foto deve contenere almeno 3 caratteri.'
    );
    assert.deepEqual(translated.details, {
        constraint: 'photos_title_check',
        field: 'title',
        minimumLength: 3
    });
});

test('keeps unknown checks safe while preserving their identifier for diagnostics', () => {
    const translated = translatePostgresError({
        code: '23514',
        constraint: 'future_constraint'
    });

    assert.equal(
        translated.message,
        'Uno dei dati inviati non rispetta i vincoli richiesti.'
    );
    assert.deepEqual(translated.details, {
        constraint: 'future_constraint'
    });
});
