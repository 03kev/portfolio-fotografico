const { Readable } = require('stream');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { env } = require('../config/env');

let s3ClientInstance = null;
let s3Commands = null;

function hasAllR2EnvVars() {
    return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2Bucket);
}

function normalizePublicBaseUrl() {
    return env.r2PublicUrl;
}

function isR2Enabled() {
    return hasAllR2EnvVars();
}

function isProductionEnvironment() {
    return env.isProduction;
}

function canUseLocalFallback() {
    return !isProductionEnvironment();
}

function ensureR2ConfiguredInProduction() {
    if (isProductionEnvironment() && !isR2Enabled()) {
        throw new Error(
            'Configurazione R2 mancante: in produzione il backend e` R2-only. ' +
            'Imposta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.'
        );
    }
}

function getR2Client() {
    if (!isR2Enabled()) {
        return null;
    }

    if (!s3ClientInstance) {
        const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

        s3Commands = { GetObjectCommand, PutObjectCommand, DeleteObjectCommand };
        s3ClientInstance = new S3Client({
            region: 'auto',
            endpoint:
                env.r2Endpoint ||
                `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: env.r2AccessKeyId,
                secretAccessKey: env.r2SecretAccessKey
            }
        });
    }

    return s3ClientInstance;
}

function normalizeObjectKey(key) {
    return String(key || '')
        .replace(/^\/+/, '')
        .replace(/^uploads\/+/, '');
}

function uploadPathToObjectKey(uploadPath) {
    const raw = String(uploadPath || '').trim();

    if (!raw) return null;

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        try {
            const parsed = new URL(raw);
            return normalizeObjectKey(parsed.pathname);
        } catch (error) {
            return null;
        }
    }

    return normalizeObjectKey(raw.replace(/^\/+/, ''));
}

function objectKeyToUploadPath(objectKey) {
    const key = normalizeObjectKey(objectKey);
    return `/uploads/${key}`;
}

function objectBodyToNodeStream(body) {
    if (!body) return null;

    if (typeof body.pipe === 'function') {
        return body;
    }

    if (typeof body.transformToWebStream === 'function') {
        return Readable.fromWeb(body.transformToWebStream());
    }

    if (typeof body.transformToByteArray === 'function') {
        return Readable.from(body.transformToByteArray());
    }

    if (Symbol.asyncIterator in body) {
        return Readable.from(body);
    }

    return null;
}

async function putUploadObject(uploadPath, buffer, options = {}) {
    if (!isR2Enabled()) {
        throw new Error('R2 non configurato: impossibile caricare l\'oggetto.');
    }

    const key = uploadPathToObjectKey(uploadPath);
    const client = getR2Client();
    const { PutObjectCommand } = s3Commands;

    await client.send(
        new PutObjectCommand({
            Bucket: env.r2Bucket,
            Key: key,
            Body: buffer,
            ContentType: options.contentType || 'application/octet-stream',
            CacheControl: options.cacheControl || 'public, max-age=31536000, immutable'
        })
    );

    const publicBaseUrl = normalizePublicBaseUrl();

    return {
        key,
        uploadPath: objectKeyToUploadPath(key),
        publicUrl: publicBaseUrl ? `${publicBaseUrl}/${key}` : null
    };
}

async function createUploadPresignedPutUrl(uploadPath, options = {}) {
    if (!isR2Enabled()) {
        throw new Error('R2 non configurato: impossibile creare URL di upload firmata.');
    }

    const key = uploadPathToObjectKey(uploadPath);
    const client = getR2Client();
    const { PutObjectCommand } = s3Commands;
    const expiresInSeconds = Number(options.expiresInSeconds) > 0 ? Number(options.expiresInSeconds) : 300;

    const command = new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: key,
        ContentType: options.contentType || 'application/octet-stream',
        CacheControl: options.cacheControl || 'public, max-age=31536000, immutable'
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    const publicBaseUrl = normalizePublicBaseUrl();

    return {
        key,
        uploadPath: objectKeyToUploadPath(key),
        uploadUrl,
        expiresInSeconds,
        publicUrl: publicBaseUrl ? `${publicBaseUrl}/${key}` : null
    };
}

async function deleteUploadObject(uploadPath) {
    if (!isR2Enabled()) {
        return;
    }

    const key = uploadPathToObjectKey(uploadPath);
    if (!key) return;

    const client = getR2Client();
    const { DeleteObjectCommand } = s3Commands;

    await client.send(
        new DeleteObjectCommand({
            Bucket: env.r2Bucket,
            Key: key
        })
    );
}

async function getUploadObject(uploadPath) {
    if (!isR2Enabled()) {
        return null;
    }

    const key = uploadPathToObjectKey(uploadPath);
    if (!key) return null;

    const client = getR2Client();
    const { GetObjectCommand } = s3Commands;

    try {
        const response = await client.send(
            new GetObjectCommand({
                Bucket: env.r2Bucket,
                Key: key
            })
        );

        return {
            key,
            stream: objectBodyToNodeStream(response.Body),
            contentType: response.ContentType,
            cacheControl: response.CacheControl,
            contentLength: response.ContentLength,
            etag: response.ETag,
            lastModified: response.LastModified
        };
    } catch (error) {
        const statusCode = error?.$metadata?.httpStatusCode;
        if (statusCode === 404 || error?.name === 'NoSuchKey' || error?.Code === 'NoSuchKey') {
            return null;
        }
        throw error;
    }
}

module.exports = {
    canUseLocalFallback,
    createUploadPresignedPutUrl,
    ensureR2ConfiguredInProduction,
    getUploadObject,
    isR2Enabled,
    objectKeyToUploadPath,
    putUploadObject,
    uploadPathToObjectKey,
    deleteUploadObject
};
