const PUBLIC_UPLOADS_PREFIX = '/uploads';
const PRIVATE_PREFIX = '/private';

const ASSET_PATHS = Object.freeze({
    PRIVATE_PREFIX,
    PRIVATE_SOURCE_PREFIX: `${PRIVATE_PREFIX}/source`,
    PUBLIC_UPLOADS_PREFIX
});

module.exports = ASSET_PATHS;
