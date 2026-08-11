const {
    HeadObjectCommand,
    ListObjectsV2Command,
    S3Client
} = require('@aws-sdk/client-s3');
const { env } = require('../config/env');
const {
    namespaceObjectKey,
    normalizeR2ObjectPrefix,
    stripObjectNamespace
} = require('../utils/r2ObjectNamespace');

function createConfiguredR2InventoryClient() {
    if (
        !env.r2AccountId
        || !env.r2AccessKeyId
        || !env.r2SecretAccessKey
        || !env.r2Bucket
    ) {
        throw new Error('Configurazione R2 incompleta per la riconciliazione.');
    }
    return new S3Client({
        region: 'auto',
        endpoint: env.r2Endpoint || `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: env.r2AccessKeyId,
            secretAccessKey: env.r2SecretAccessKey
        }
    });
}

function normalizeListedObject(scope, objectNamespace, object) {
    const key = String(object?.Key || '').replace(/^\/+/, '');
    const relativeKey = stripObjectNamespace(key, objectNamespace);
    return {
        scope: typeof scope === 'function' ? scope(relativeKey) : scope,
        key,
        relativeKey,
        size: Number(object?.Size || 0),
        etag: object?.ETag || '',
        lastModified: object?.LastModified || null,
        contentType: ''
    };
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from(
        { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
        async () => {
            while (cursor < items.length) {
                const index = cursor;
                cursor += 1;
                results[index] = await mapper(items[index], index);
            }
        }
    );
    await Promise.all(workers);
    return results;
}

async function listScopeObjects({
    client,
    bucket,
    scope,
    objectNamespace,
    shouldHead,
    headConcurrency
}) {
    const prefix = normalizeR2ObjectPrefix(objectNamespace);
    const requestPrefix = prefix ? `${prefix}/` : undefined;
    const objects = [];
    let continuationToken;
    do {
        const response = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: requestPrefix,
            ContinuationToken: continuationToken
        }));
        objects.push(...(response.Contents || []).map((object) => (
            normalizeListedObject(scope, prefix, object)
        )));
        continuationToken = response.IsTruncated
            ? response.NextContinuationToken
            : undefined;
    } while (continuationToken);

    return mapWithConcurrency(objects, headConcurrency, async (object) => {
        if (!shouldHead(object.scope, object.relativeKey)) return object;
        const response = await client.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: object.key
        }));
        return {
            ...object,
            size: Number(response.ContentLength ?? object.size ?? 0),
            etag: response.ETag || object.etag,
            lastModified: response.LastModified || object.lastModified,
            contentType: response.ContentType || ''
        };
    });
}

async function readR2ObjectInventory({
    client = createConfiguredR2InventoryClient(),
    publicBucket = env.r2Bucket,
    privateBucket = env.r2PrivateBucket,
    objectNamespace = env.r2ObjectPrefix,
    shouldHead = () => true,
    headConcurrency = 8
} = {}) {
    if (!String(publicBucket || '').trim()) {
        throw new Error('R2_BUCKET è obbligatorio per la riconciliazione.');
    }
    if (!String(privateBucket || '').trim()) {
        throw new Error(
            'R2_PRIVATE_BUCKET è obbligatorio per la riconciliazione; '
            + 'il bucket pubblico non viene usato come fallback.'
        );
    }
    const normalizedNamespace = normalizeR2ObjectPrefix(objectNamespace);
    if (publicBucket === privateBucket) {
        return listScopeObjects({
            client,
            bucket: publicBucket,
            scope: (relativeKey) => (
                relativeKey.startsWith('source/') ? 'private' : 'public'
            ),
            objectNamespace: normalizedNamespace,
            shouldHead,
            headConcurrency
        });
    }
    const [publicObjects, privateObjects] = await Promise.all([
        listScopeObjects({
            client,
            bucket: publicBucket,
            scope: 'public',
            objectNamespace: normalizedNamespace,
            shouldHead,
            headConcurrency
        }),
        listScopeObjects({
            client,
            bucket: privateBucket,
            scope: 'private',
            objectNamespace: normalizedNamespace,
            shouldHead,
            headConcurrency
        })
    ]);
    return [...publicObjects, ...privateObjects].sort((left, right) => (
        `${left.scope}:${left.key}`.localeCompare(`${right.scope}:${right.key}`)
    ));
}

function logicalPathToNamespacedObjectKey(logicalPath, scope, objectNamespace = env.r2ObjectPrefix) {
    const normalized = String(logicalPath || '').replace(/^\/+/, '');
    const scopePrefix = scope === 'private' ? 'private/' : 'uploads/';
    const relative = normalized.startsWith(scopePrefix)
        ? normalized.slice(scopePrefix.length)
        : normalized;
    return namespaceObjectKey(relative, objectNamespace);
}

module.exports = {
    createConfiguredR2InventoryClient,
    logicalPathToNamespacedObjectKey,
    readR2ObjectInventory
};
