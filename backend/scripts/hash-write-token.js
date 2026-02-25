#!/usr/bin/env node
const { createTokenHash } = require('../src/utils/tokenHash');

const token = process.argv[2];

if (!token || String(token).trim().length < 10) {
    console.error('Uso: node scripts/hash-write-token.js "<TOKEN_LUNGO_RANDOM>"');
    console.error('Suggerito: almeno 32 caratteri casuali.');
    process.exit(1);
}

try {
    const hash = createTokenHash(token);
    console.log(hash);
} catch (error) {
    console.error('Errore generazione hash token:', error.message);
    process.exit(1);
}
