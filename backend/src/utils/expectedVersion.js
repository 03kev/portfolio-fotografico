function parseVersion(value) {
    if (value === undefined || value === null || value === '') return null;
    const normalized = String(value).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        const error = new Error('expectedVersion deve essere un intero positivo.');
        error.status = 400;
        error.code = 'INVALID_EXPECTED_VERSION';
        throw error;
    }
    return parsed;
}

function getExpectedVersion(req) {
    const fromHeader = parseVersion(req.get('if-match'));
    const fromBody = parseVersion(req.body?.expectedVersion);
    if (fromHeader !== null && fromBody !== null && fromHeader !== fromBody) {
        const error = new Error('If-Match ed expectedVersion non coincidono.');
        error.status = 400;
        error.code = 'EXPECTED_VERSION_MISMATCH';
        throw error;
    }
    return fromHeader ?? fromBody;
}

function repositoryOptionsFromRequest(req) {
    const expectedVersion = getExpectedVersion(req);
    return expectedVersion === null ? {} : { expectedVersion };
}

module.exports = {
    getExpectedVersion,
    repositoryOptionsFromRequest
};
