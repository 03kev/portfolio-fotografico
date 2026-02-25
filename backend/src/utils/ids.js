function parseNumericIdOrThrow(value, label = 'ID') {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        const error = new Error(`${label} non valido`);
        error.status = 400;
        error.code = 'INVALID_ID';
        throw error;
    }
    return parsed;
}

module.exports = {
    parseNumericIdOrThrow
};
