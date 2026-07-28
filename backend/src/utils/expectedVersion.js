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
    const fromApplicationHeader = parseVersion(req.get('x-expected-version'));
    const fromHttpHeader = parseVersion(req.get('if-match'));
    const fromBody = parseVersion(req.body?.expectedVersion);
    const providedVersions = [
        fromApplicationHeader,
        fromHttpHeader,
        fromBody
    ].filter((version) => version !== null);

    if (new Set(providedVersions).size > 1) {
        const error = new Error('Le versioni attese fornite non coincidono.');
        error.status = 400;
        error.code = 'EXPECTED_VERSION_MISMATCH';
        throw error;
    }
    return fromApplicationHeader ?? fromHttpHeader ?? fromBody;
}

function repositoryOptionsFromRequest(req) {
    const expectedVersion = getExpectedVersion(req);
    return expectedVersion === null ? {} : { expectedVersion };
}

module.exports = {
    getExpectedVersion,
    repositoryOptionsFromRequest
};
