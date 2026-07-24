const metadataStorage = require('../services/metadataStorage');
const { env } = require('../config/env');
const { JsonPortfolioRepository } = require('./JsonPortfolioRepository');

function createPostgresPool(databaseUrl = env.databaseUrl) {
    let Pool;
    try {
        ({ Pool } = require('pg'));
    } catch (error) {
        const missingDriver = new Error(
            'METADATA_BACKEND=postgres richiede la dipendenza "pg". Esegui npm install nel backend.'
        );
        missingDriver.code = 'POSTGRES_DRIVER_MISSING';
        missingDriver.cause = error;
        throw missingDriver;
    }

    return new Pool({
        connectionString: databaseUrl,
        max: env.databasePoolMax,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 5_000,
        application_name: 'portfolio-fotografico'
    });
}

function createPortfolioRepository({
    backend = env.metadataBackend,
    postgresPool = null,
    jsonMetadataStorage = metadataStorage
} = {}) {
    if (backend === 'json') {
        return new JsonPortfolioRepository(jsonMetadataStorage);
    }

    if (backend === 'postgres') {
        const { PostgresPortfolioRepository } = require('./PostgresPortfolioRepository');
        return new PostgresPortfolioRepository(postgresPool || createPostgresPool());
    }

    throw new Error(`Metadata backend non supportato: ${backend}`);
}

const portfolioRepository = createPortfolioRepository();

module.exports = {
    createPortfolioRepository,
    createPostgresPool,
    portfolioRepository
};
