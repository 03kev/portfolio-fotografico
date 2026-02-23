const fs = require('fs').promises;

const { ensureDataFile } = require('../config/storage');
const { env } = require('../config/env');
const { canUseLocalFallback, getUploadObject, isR2Enabled, putUploadObject } = require('./r2Storage');

const DEFAULT_PREFIX = 'data';

function getMetadataObjectPath(filename) {
    const safeFilename = String(filename || '').replace(/^\/+/, '');
    const prefix = String(env.r2MetadataPrefix || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, '');
    return `/${prefix}/${safeFilename}`;
}

async function readStreamAsString(stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString('utf8');
}

async function readLocalJson(filename, fallbackValue = []) {
    try {
        const dataPath = await ensureDataFile(filename);
        const content = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error.code === 'ENOENT') return fallbackValue;
        throw error;
    }
}

async function writeLocalJson(filename, value) {
    const dataPath = await ensureDataFile(filename);
    await fs.writeFile(dataPath, JSON.stringify(value, null, 2));
}

async function readMetadataFile(filename, fallbackValue = []) {
    if (!isR2Enabled()) {
        if (!canUseLocalFallback()) {
            throw new Error('Configurazione R2 mancante: metadati disponibili solo su R2 in produzione.');
        }
        return readLocalJson(filename, fallbackValue);
    }

    const objectPath = getMetadataObjectPath(filename);
    const object = await getUploadObject(objectPath);

    if (!object) {
        if (canUseLocalFallback()) {
            const seedData = await readLocalJson(filename, fallbackValue);
            await writeMetadataFile(filename, seedData);
            return seedData;
        }
        return fallbackValue;
    }

    if (!object.stream) {
        throw new Error(`Oggetto metadati senza stream: ${objectPath}`);
    }

    const content = await readStreamAsString(object.stream);
    if (!content.trim()) {
        return fallbackValue;
    }
    return JSON.parse(content);
}

async function writeMetadataFile(filename, value) {
    if (!isR2Enabled()) {
        if (!canUseLocalFallback()) {
            throw new Error('Configurazione R2 mancante: scrittura metadati consentita solo su R2 in produzione.');
        }
        await writeLocalJson(filename, value);
        return;
    }

    const objectPath = getMetadataObjectPath(filename);
    await putUploadObject(objectPath, Buffer.from(JSON.stringify(value, null, 2), 'utf8'), {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store'
    });
}

module.exports = {
    readMetadataFile,
    writeMetadataFile
};
