function createRequireDurableMediaLifecycle(repository) {
    return function requireDurableMediaLifecycle(_req, res, next) {
        if (repository?.capabilities?.durableMediaCleanup) {
            return next();
        }

        return res.status(503).json({
            success: false,
            code: 'TRANSACTIONAL_MEDIA_LIFECYCLE_REQUIRED',
            message:
                'Questa operazione media richiede METADATA_BACKEND=postgres e il cleanup R2 durevole.'
        });
    };
}

module.exports = {
    createRequireDurableMediaLifecycle
};
