const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    readR2ObjectInventory
} = require('../src/services/r2InventoryReader');

test('R2 inventory reader only lists and heads objects inside the requested namespace', async () => {
    const commands = [];
    const client = {
        async send(command) {
            const name = command.constructor.name;
            commands.push({ name, input: command.input });
            if (name === 'ListObjectsV2Command') {
                return {
                    IsTruncated: false,
                    Contents: [{
                        Key: `${command.input.Prefix}photos/7/01KYMPAMCGZG34TT5JX1BCBB9K/full.webp`,
                        Size: 99,
                        ETag: 'list-etag',
                        LastModified: new Date('2026-08-11T00:00:00.000Z')
                    }]
                };
            }
            if (name === 'HeadObjectCommand') {
                return {
                    ContentLength: 99,
                    ContentType: 'image/webp',
                    ETag: 'head-etag',
                    LastModified: new Date('2026-08-11T00:00:00.000Z')
                };
            }
            throw new Error(`Comando mutante o inatteso: ${name}`);
        }
    };

    const objects = await readR2ObjectInventory({
        client,
        publicBucket: 'public-bucket',
        privateBucket: 'private-bucket',
        objectNamespace: 'preview/branch',
        shouldHead: () => true,
        headConcurrency: 2
    });

    assert.equal(objects.length, 2);
    assert.equal(objects.every((entry) => (
        entry.relativeKey === 'photos/7/01KYMPAMCGZG34TT5JX1BCBB9K/full.webp'
        && entry.contentType === 'image/webp'
    )), true);
    assert.deepEqual(
        new Set(commands.map((entry) => entry.name)),
        new Set(['ListObjectsV2Command', 'HeadObjectCommand'])
    );
    assert.equal(
        commands
            .filter((entry) => entry.name === 'ListObjectsV2Command')
            .every((entry) => entry.input.Prefix === 'preview/branch/'),
        true
    );
});

test('R2 inventory reader refuses an implicit private-to-public bucket fallback', async () => {
    const client = {
        async send() {
            throw new Error('non deve interrogare R2 senza provenienza completa');
        }
    };

    await assert.rejects(
        () => readR2ObjectInventory({
            client,
            publicBucket: 'public-bucket',
            privateBucket: '',
            objectNamespace: ''
        }),
        /R2_PRIVATE_BUCKET.*non viene usato come fallback/
    );
});

test('R2 inventory reader lists an explicitly shared bucket once and preserves scopes', async () => {
    const commands = [];
    const client = {
        async send(command) {
            commands.push(command.input);
            return {
                IsTruncated: false,
                Contents: [
                    { Key: 'photos/7/generation/full.webp', Size: 10 },
                    { Key: 'source/photos/7/generation/source.jpg', Size: 20 }
                ]
            };
        }
    };

    const objects = await readR2ObjectInventory({
        client,
        publicBucket: 'shared-bucket',
        privateBucket: 'shared-bucket',
        shouldHead: () => false
    });

    assert.equal(commands.length, 1);
    assert.deepEqual(
        objects.map((entry) => [entry.relativeKey, entry.scope]),
        [
            ['photos/7/generation/full.webp', 'public'],
            ['source/photos/7/generation/source.jpg', 'private']
        ]
    );
});
