const { isValid, monotonicFactory } = require('ulid');

const createMonotonicUlid = monotonicFactory();

function createMediaGeneration(timestamp = Date.now()) {
    return createMonotonicUlid(timestamp);
}

function normalizeMediaGeneration(value, { required = false } = {}) {
    const generation = String(value || '').trim().toUpperCase();
    if (!generation) {
        if (required) {
            throw new TypeError('Generazione media mancante.');
        }
        return '';
    }
    if (!isValid(generation)) {
        throw new TypeError('Generazione media non valida: è richiesto un ULID.');
    }
    return generation;
}

module.exports = {
    createMediaGeneration,
    normalizeMediaGeneration
};
