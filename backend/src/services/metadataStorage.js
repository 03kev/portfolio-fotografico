const { env } = require('../config/env');
const { getUploadObject, isR2Enabled, putUploadObject } = require('./r2Storage');

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

async function readMetadataFile(filename, fallbackValue = []) {
    if (!isR2Enabled()) {
        throw new Error('Configurazione R2 mancante: metadati disponibili solo su R2.');
    }

    const objectPath = getMetadataObjectPath(filename);
    const object = await getUploadObject(objectPath);

    if (!object) {
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
        throw new Error('Configurazione R2 mancante: scrittura metadati consentita solo su R2.');
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
