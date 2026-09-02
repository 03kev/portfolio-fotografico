const crypto = require('node:crypto');
const {
    analyzeMetadataSnapshot,
    assertMetadataCutoverReady
} = require('./metadataMigration');
const {
    normalizePublishedPhotoAssetInventory
} = require('./photoAssetLifecycle');
const { normalizeMimeType } = require('@portfolio/photo-upload-contract');

const RECONCILIATION_SCHEMA_VERSION = 2;
const MEDIA_GENERATION_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Frozen evidence schema for the historical generation that is being reconciled.
// This is deliberately independent from PHOTO_DERIVATIVE_VARIANTS: changing what
// the application produces today must not change what this tool claims existed.
const HISTORICAL_DERIVATIVE_FILES = Object.freeze({
    'full.webp': Object.freeze({ role: 'full', contentType: 'image/webp' }),
    'mobile.webp': Object.freeze({ role: 'mobile', contentType: 'image/webp' }),
    'thumbnail-4x3.webp': Object.freeze({ role: 'thumbnail-4x3', contentType: 'image/webp' }),
    'thumbnail-1x1.webp': Object.freeze({ role: 'thumbnail-1x1', contentType: 'image/webp' }),
    'social.jpg': Object.freeze({ role: 'social', contentType: 'image/jpeg' })
});

const ROLE_ORDER = Object.freeze([
    'full',
    'mobile',
    'thumbnail-4x3',
    'thumbnail-1x1',
    'social',
    'source'
]);

const PUBLIC_CANONICAL_PATTERN = /^photos\/([1-9][0-9]*)\/([0-9A-HJKMNP-TV-Z]{26})\/([^/]+)$/;
const PRIVATE_CANONICAL_PATTERN = /^source\/photos\/([1-9][0-9]*)\/([0-9A-HJKMNP-TV-Z]{26})\/([^/]+)$/;
const LEGACY_PUBLIC_PATTERNS = Object.freeze([
    { pattern: /^photo_([1-9][0-9]*)\.webp$/, role: 'full' },
    { pattern: /^mobile\/photo_([1-9][0-9]*)\.webp$/, role: 'mobile' },
    { pattern: /^thumbnails\/4x3\/photo_([1-9][0-9]*)\.webp$/, role: 'thumbnail-4x3' },
    { pattern: /^thumbnails\/1x1\/photo_([1-9][0-9]*)\.webp$/, role: 'thumbnail-1x1' },
    { pattern: /^social\/photo_([1-9][0-9]*)\.jpg$/, role: 'social' }
]);
const LEGACY_PRIVATE_PATTERN = /^source\/photo_([1-9][0-9]*)\.([a-z0-9]+)$/;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isPlainObject(value)) return value;
    return Object.keys(value)
        .sort()
        .reduce((result, key) => {
            result[key] = canonicalize(value[key]);
            return result;
        }, {});
}

function stableStringify(value, spacing = 0) {
    return JSON.stringify(canonicalize(value), null, spacing);
}

function checksum(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function checksumBytes(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeReconciliationProvenance({
    publicBucket,
    privateBucket,
    objectNamespace = ''
} = {}) {
    const normalizedPublicBucket = String(publicBucket || '').trim();
    const normalizedPrivateBucket = String(privateBucket || '').trim();
    if (!normalizedPublicBucket) {
        throw new TypeError('Il bucket R2 pubblico è obbligatorio per la riconciliazione.');
    }
    if (!normalizedPrivateBucket) {
        throw new TypeError(
            'Il bucket R2 privato è obbligatorio per la riconciliazione; '
            + 'non viene dedotto automaticamente dal bucket pubblico.'
        );
    }
    return {
        publicBucket: normalizedPublicBucket,
        privateBucket: normalizedPrivateBucket,
        objectNamespace: String(objectNamespace || '').trim().replace(/^\/+|\/+$/g, ''),
        sharedBucket: normalizedPublicBucket === normalizedPrivateBucket
    };
}

function normalizeEtag(value) {
    return String(value || '').trim().replace(/^"|"$/g, '');
}

function normalizeObservedObject(object) {
    const scope = String(object?.scope || '').trim().toLowerCase();
    const relativeKey = String(object?.relativeKey ?? object?.key ?? '')
        .trim()
        .replace(/^\/+/, '');
    const size = Number(object?.size ?? object?.contentLength ?? 0);
    if (!['public', 'private'].includes(scope) || !relativeKey) {
        throw new TypeError('Oggetto R2 osservato privo di scope o key valida.');
    }
    return {
        scope,
        key: String(object?.key || relativeKey).trim().replace(/^\/+/, ''),
        relativeKey,
        size: Number.isSafeInteger(size) && size >= 0 ? size : 0,
        etag: normalizeEtag(object?.etag),
        lastModified: object?.lastModified
            ? new Date(object.lastModified).toISOString()
            : null,
        contentType: normalizeMimeType(object?.contentType)
    };
}

function sourceContentTypeForFileName(fileName) {
    const extension = String(fileName || '').split('.').pop()?.toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    return '';
}

function classifyObservedObject(object) {
    const normalized = normalizeObservedObject(object);
    if (normalized.scope === 'public') {
        const canonical = PUBLIC_CANONICAL_PATTERN.exec(normalized.relativeKey);
        if (canonical) {
            const definition = HISTORICAL_DERIVATIVE_FILES[canonical[3]] || null;
            return {
                ...normalized,
                kind: definition ? 'canonical-derivative' : 'canonical-unknown',
                photoId: Number(canonical[1]),
                generation: canonical[2],
                fileName: canonical[3],
                role: definition?.role || null,
                expectedContentType: definition?.contentType || null,
                logicalPath: `/uploads/${normalized.relativeKey}`
            };
        }
        for (const definition of LEGACY_PUBLIC_PATTERNS) {
            const legacy = definition.pattern.exec(normalized.relativeKey);
            if (legacy) {
                return {
                    ...normalized,
                    kind: 'legacy-photo-object',
                    photoId: Number(legacy[1]),
                    role: definition.role,
                    generation: null,
                    logicalPath: `/uploads/${normalized.relativeKey}`
                };
            }
        }
    }

    if (normalized.scope === 'private') {
        const canonical = PRIVATE_CANONICAL_PATTERN.exec(normalized.relativeKey);
        if (canonical) {
            const expectedContentType = /^source\.[^/]+$/.test(canonical[3])
                ? sourceContentTypeForFileName(canonical[3])
                : '';
            return {
                ...normalized,
                kind: expectedContentType ? 'canonical-source' : 'canonical-unknown',
                photoId: Number(canonical[1]),
                generation: canonical[2],
                fileName: canonical[3],
                role: expectedContentType ? 'source' : null,
                expectedContentType: expectedContentType || null,
                logicalPath: `/private/${normalized.relativeKey}`
            };
        }
        const legacy = LEGACY_PRIVATE_PATTERN.exec(normalized.relativeKey);
        if (legacy) {
            return {
                ...normalized,
                kind: 'legacy-photo-object',
                photoId: Number(legacy[1]),
                role: 'source',
                generation: null,
                logicalPath: `/private/${normalized.relativeKey}`
            };
        }
    }

    return { ...normalized, kind: 'unrelated' };
}

function isPhotoInventoryObjectKey(scope, relativeKey) {
    const classification = classifyObservedObject({
        scope,
        relativeKey,
        size: 0
    });
    return classification.kind !== 'unrelated';
}

function objectIdentity(object) {
    return `${object.scope}:${object.relativeKey}`;
}

function evidenceFor(object) {
    return {
        scope: object.scope,
        key: object.key,
        relativeKey: object.relativeKey,
        logicalPath: object.logicalPath || null,
        size: object.size,
        contentType: object.contentType || null,
        etag: object.etag || null,
        lastModified: object.lastModified || null
    };
}

function isObservedObjectUsable(object) {
    return (
        object.size > 0
        && Boolean(object.expectedContentType)
        && object.contentType === object.expectedContentType
    );
}

function descriptorFor(object) {
    return {
        role: object.role,
        replacementGroup: object.role === 'source' ? 'source' : 'derivatives',
        scope: object.scope,
        path: object.logicalPath,
        contentType: object.expectedContentType,
        generation: object.generation
    };
}

function sortAssetDescriptors(assets) {
    const rank = new Map(ROLE_ORDER.map((role, index) => [role, index]));
    return [...assets].sort((left, right) => (
        (rank.get(left.role) ?? Number.MAX_SAFE_INTEGER)
        - (rank.get(right.role) ?? Number.MAX_SAFE_INTEGER)
        || left.role.localeCompare(right.role)
    ));
}

function stripLegacyInventoryHints(record) {
    const next = { ...record };
    delete next.source;
    delete next.sourcePath;
    delete next.sourceContentType;
    delete next.mobileImage;
    return next;
}

function addAmbiguity(collection, entry, seen) {
    const identity = `${entry.code}:${entry.scope || ''}:${entry.key || ''}:${entry.photoId || ''}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    collection.push(entry);
}

function reconcileMissingInventory(record, objects, context) {
    const photoId = Number(record.id);
    const derivatives = objects.filter((object) => (
        object.photoId === photoId
        && object.kind === 'canonical-derivative'
    ));
    const unknown = objects.filter((object) => (
        object.photoId === photoId
        && object.kind === 'canonical-unknown'
    ));
    const sources = objects.filter((object) => (
        object.photoId === photoId
        && object.kind === 'canonical-source'
    ));
    const declaredGeneration = String(record.mediaGeneration || '').trim().toUpperCase();
    const fullGenerations = [...new Set(
        derivatives
            .filter((object) => object.role === 'full' && isObservedObjectUsable(object))
            .map((object) => object.generation)
    )].sort();
    const invalidFullObjects = derivatives.filter((object) => (
        object.role === 'full' && !isObservedObjectUsable(object)
    ));
    let selectedGeneration = null;

    if (MEDIA_GENERATION_PATTERN.test(declaredGeneration)) {
        selectedGeneration = declaredGeneration;
        if (!fullGenerations.includes(selectedGeneration)) {
            context.missingAssets.push({
                code: 'DECLARED_GENERATION_FULL_MISSING',
                photoId,
                role: 'full',
                generation: selectedGeneration,
                requiredForPublication: true
            });
            return { status: 'missing', publishable: false, assets: null };
        }
    } else if (fullGenerations.length === 1) {
        [selectedGeneration] = fullGenerations;
    } else if (fullGenerations.length === 0) {
        for (const object of invalidFullObjects) {
            addAmbiguity(context.ambiguousObjects, {
                code: 'INVALID_FULL_OBJECT_METADATA',
                photoId,
                generation: object.generation,
                role: 'full',
                expectedContentType: object.expectedContentType,
                ...evidenceFor(object)
            }, context.ambiguitySeen);
        }
        context.missingAssets.push({
            code: 'CANONICAL_FULL_MISSING',
            photoId,
            role: 'full',
            generation: null,
            requiredForPublication: true
        });
        return { status: 'missing', publishable: false, assets: null };
    } else {
        addAmbiguity(context.ambiguousObjects, {
            code: 'MULTIPLE_PUBLISHED_GENERATION_CANDIDATES',
            photoId,
            generations: fullGenerations
        }, context.ambiguitySeen);
        return { status: 'ambiguous', publishable: false, assets: null };
    }

    const selectedObjects = derivatives.filter((object) => object.generation === selectedGeneration);
    const selectedUnknown = unknown.filter((object) => object.generation === selectedGeneration);
    let blocked = false;
    for (const object of selectedUnknown) {
        blocked = true;
        addAmbiguity(context.ambiguousObjects, {
            code: 'UNKNOWN_ASSET_ROLE_IN_SELECTED_GENERATION',
            photoId,
            generation: selectedGeneration,
            ...evidenceFor(object)
        }, context.ambiguitySeen);
    }
    for (const object of selectedObjects) {
        if (!isObservedObjectUsable(object)) {
            blocked = true;
            addAmbiguity(context.ambiguousObjects, {
                code: 'INVALID_ASSET_OBJECT_METADATA',
                photoId,
                generation: selectedGeneration,
                role: object.role,
                expectedContentType: object.expectedContentType,
                ...evidenceFor(object)
            }, context.ambiguitySeen);
        }
    }

    let source = null;
    const explicitSourcePath = String(record.source?.path || record.sourcePath || '').trim();
    if (explicitSourcePath.startsWith('/private/source/photos/')) {
        source = sources.find((candidate) => candidate.logicalPath === explicitSourcePath) || null;
        if (!source) {
            blocked = true;
            context.missingAssets.push({
                code: 'DECLARED_CANONICAL_SOURCE_MISSING',
                photoId,
                role: 'source',
                path: explicitSourcePath,
                requiredForPublication: false
            });
        }
    } else if (sources.length === 1) {
        [source] = sources;
    } else if (sources.length > 1) {
        blocked = true;
        addAmbiguity(context.ambiguousObjects, {
            code: 'MULTIPLE_SOURCE_CANDIDATES',
            photoId,
            candidates: sources.map(evidenceFor)
        }, context.ambiguitySeen);
    } else {
        context.missingAssets.push({
            code: 'CANONICAL_SOURCE_MISSING',
            photoId,
            role: 'source',
            requiredForPublication: false
        });
    }

    if (source && !isObservedObjectUsable(source)) {
        blocked = true;
        addAmbiguity(context.ambiguousObjects, {
            code: 'INVALID_SOURCE_OBJECT_METADATA',
            photoId,
            expectedContentType: source.expectedContentType,
            ...evidenceFor(source)
        }, context.ambiguitySeen);
    }
    if (blocked) {
        return { status: 'ambiguous', publishable: false, assets: null };
    }

    const usableDerivatives = selectedObjects.filter(isObservedObjectUsable);
    if (!usableDerivatives.some((object) => object.role === 'full')) {
        context.missingAssets.push({
            code: 'CANONICAL_FULL_MISSING',
            photoId,
            role: 'full',
            generation: selectedGeneration,
            requiredForPublication: true
        });
        return { status: 'missing', publishable: false, assets: null };
    }

    const selected = [...usableDerivatives, ...(source ? [source] : [])];
    const assets = sortAssetDescriptors(selected.map(descriptorFor));
    try {
        normalizePublishedPhotoAssetInventory(assets, {
            photoId,
            mediaGeneration: selectedGeneration
        });
    } catch (error) {
        addAmbiguity(context.ambiguousObjects, {
            code: 'PROPOSED_INVENTORY_CONTRACT_VIOLATION',
            photoId,
            message: error.message
        }, context.ambiguitySeen);
        return { status: 'ambiguous', publishable: false, assets: null };
    }

    for (const object of selected) {
        context.claimed.add(objectIdentity(object));
        context.confirmedAssets.push({
            photoId,
            role: object.role,
            generation: object.generation,
            ...evidenceFor(object)
        });
    }
    return {
        status: 'confirmed',
        publishable: true,
        mediaGeneration: selectedGeneration,
        assets
    };
}

function reconcileExplicitInventory(record, objects, context) {
    const photoId = Number(record.id);
    const objectByLogicalPath = new Map(
        objects
            .filter((object) => object.logicalPath)
            .map((object) => [`${object.scope}:${object.logicalPath}`, object])
    );
    let blocked = false;
    const confirmed = [];
    let normalizedAssets;
    try {
        normalizedAssets = normalizePublishedPhotoAssetInventory(record.assets, {
            photoId,
            mediaGeneration: record.mediaGeneration
        });
    } catch (error) {
        addAmbiguity(context.ambiguousObjects, {
            code: 'EXPLICIT_INVENTORY_CONTRACT_VIOLATION',
            photoId,
            message: error.message
        }, context.ambiguitySeen);
        return { status: 'ambiguous', publishable: false, assets: null };
    }

    for (const asset of normalizedAssets) {
        const object = objectByLogicalPath.get(`${asset.scope}:${asset.path}`);
        if (!object) {
            blocked = true;
            context.missingAssets.push({
                code: 'EXPLICIT_ASSET_OBJECT_MISSING',
                photoId,
                role: asset.role,
                scope: asset.scope,
                path: asset.path,
                requiredForPublication: asset.role === 'full'
            });
            continue;
        }
        if (
            object.contentType !== asset.contentType
            || object.size <= 0
            || object.photoId !== photoId
            || object.generation !== asset.generation
        ) {
            blocked = true;
            addAmbiguity(context.ambiguousObjects, {
                code: 'EXPLICIT_ASSET_EVIDENCE_MISMATCH',
                photoId,
                role: asset.role,
                declared: asset,
                ...evidenceFor(object)
            }, context.ambiguitySeen);
            continue;
        }
        context.claimed.add(objectIdentity(object));
        confirmed.push(object);
    }
    if (blocked) return { status: 'ambiguous', publishable: false, assets: null };
    for (const object of confirmed) {
        context.confirmedAssets.push({
            photoId,
            role: object.role,
            generation: object.generation,
            ...evidenceFor(object)
        });
    }
    return {
        status: 'confirmed',
        publishable: normalizedAssets.some((asset) => asset.role === 'full'),
        mediaGeneration: record.mediaGeneration,
        assets: normalizedAssets,
        unchanged: true
    };
}

function reconciliationInventoryIdentity(objects) {
    return objects
        .map((object) => ({
            scope: object.scope,
            key: object.key,
            relativeKey: object.relativeKey,
            size: object.size,
            etag: object.etag,
            lastModified: object.lastModified,
            contentType: object.contentType
        }))
        .sort((left, right) => (
            `${left.scope}:${left.key}`.localeCompare(`${right.scope}:${right.key}`)
        ));
}

function reconcileMediaInventories(snapshot, observedObjects, provenanceOptions) {
    if (!Array.isArray(snapshot?.photos) || !Array.isArray(snapshot?.series)) {
        throw new TypeError('Lo snapshot deve contenere gli array photos e series.');
    }
    const provenance = normalizeReconciliationProvenance(provenanceOptions);
    const normalizedObjects = observedObjects.map(classifyObservedObject);
    const duplicateKeys = new Set();
    const objectKeys = new Set();
    for (const object of normalizedObjects) {
        const identity = objectIdentity(object);
        if (objectKeys.has(identity)) duplicateKeys.add(identity);
        objectKeys.add(identity);
    }
    if (duplicateKeys.size > 0) {
        throw new TypeError(
            `Inventario R2 non deterministico: oggetti duplicati (${[...duplicateKeys].join(', ')}).`
        );
    }

    const sourceSnapshot = structuredClone(snapshot);
    const proposal = structuredClone(snapshot);
    const photoIds = new Set(snapshot.photos.map((photo) => Number(photo.id)));
    const context = {
        claimed: new Set(),
        confirmedAssets: [],
        missingAssets: [],
        ambiguousObjects: [],
        ambiguitySeen: new Set()
    };
    const photoReports = [];
    const changes = [];

    proposal.photos = snapshot.photos.map((record) => {
        const photoId = Number(record.id);
        const result = Array.isArray(record.assets)
            ? reconcileExplicitInventory(record, normalizedObjects, context)
            : reconcileMissingInventory(record, normalizedObjects, context);
        photoReports.push({
            photoId,
            status: result.status,
            publishable: result.publishable,
            selectedGeneration: result.mediaGeneration || null,
            roles: result.assets?.map((asset) => asset.role) || []
        });
        if (!result.assets || result.unchanged) return structuredClone(record);

        const reconciled = stripLegacyInventoryHints(record);
        reconciled.mediaGeneration = result.mediaGeneration;
        reconciled.assets = result.assets;
        changes.push({
            photoId,
            operation: 'set-canonical-media-inventory',
            mediaGeneration: result.mediaGeneration,
            roles: result.assets.map((asset) => asset.role),
            removedLegacyFields: [
                'source', 'sourcePath', 'sourceContentType', 'mobileImage'
            ].filter((field) => Object.hasOwn(record, field))
        });
        return reconciled;
    });

    const orphanObjects = [];
    let ignoredObjectCount = 0;
    for (const object of normalizedObjects) {
        if (context.claimed.has(objectIdentity(object))) continue;
        if (object.kind === 'unrelated') {
            ignoredObjectCount += 1;
            continue;
        }
        if (object.kind === 'canonical-unknown') {
            addAmbiguity(context.ambiguousObjects, {
                code: 'UNRECOGNIZED_CANONICAL_OBJECT',
                photoId: object.photoId,
                generation: object.generation,
                ...evidenceFor(object)
            }, context.ambiguitySeen);
            continue;
        }

        let reason = 'unselected-canonical-object';
        if (object.kind === 'legacy-photo-object') {
            reason = photoIds.has(object.photoId)
                ? 'superseded-legacy-photo-object'
                : 'legacy-object-without-photo-owner';
        } else if (!photoIds.has(object.photoId)) {
            reason = 'canonical-object-without-photo-owner';
        }
        orphanObjects.push({
            reason,
            photoId: object.photoId || null,
            role: object.role || null,
            generation: object.generation || null,
            ...evidenceFor(object)
        });
    }

    const preflightReport = analyzeMetadataSnapshot(proposal);
    let preflightError = null;
    try {
        assertMetadataCutoverReady(preflightReport);
    } catch (error) {
        preflightError = {
            code: error.code || 'METADATA_CUTOVER_PREFLIGHT_FAILED',
            message: error.message,
            details: error.details || null
        };
    }
    const unpublishablePhotos = photoReports
        .filter((photo) => !photo.publishable)
        .map((photo) => photo.photoId);
    const report = {
        schemaVersion: RECONCILIATION_SCHEMA_VERSION,
        provenance,
        sourceSnapshotChecksum: checksum(sourceSnapshot),
        r2InventoryChecksum: checksum({
            provenance,
            objects: reconciliationInventoryIdentity(normalizedObjects)
        }),
        proposalChecksum: checksum(proposal),
        summary: {
            snapshotPhotos: snapshot.photos.length,
            observedObjects: normalizedObjects.length,
            confirmedInventories: photoReports.filter((photo) => photo.status === 'confirmed').length,
            confirmedAssets: context.confirmedAssets.length,
            missingAssets: context.missingAssets.length,
            ambiguousCases: context.ambiguousObjects.length,
            orphanObjects: orphanObjects.length,
            ignoredObjects: ignoredObjectCount,
            unpublishablePhotos: unpublishablePhotos.length,
            proposedPhotoChanges: changes.length,
            cutoverPreflightReady: !preflightError
        },
        photos: photoReports.sort((left, right) => left.photoId - right.photoId),
        confirmedAssets: context.confirmedAssets.sort((left, right) => (
            left.photoId - right.photoId || left.role.localeCompare(right.role)
        )),
        missingAssets: context.missingAssets.sort((left, right) => (
            left.photoId - right.photoId || String(left.role).localeCompare(String(right.role))
        )),
        ambiguousCases: context.ambiguousObjects,
        orphanObjects: orphanObjects.sort((left, right) => (
            `${left.scope}:${left.relativeKey}`.localeCompare(`${right.scope}:${right.relativeKey}`)
        )),
        unpublishablePhotos,
        changes: changes.sort((left, right) => left.photoId - right.photoId),
        preflight: {
            ready: !preflightError,
            counts: preflightReport.counts,
            checksum: preflightReport.checksum,
            errors: preflightReport.errors,
            warnings: preflightReport.warnings,
            info: preflightReport.info,
            failure: preflightError
        }
    };
    report.reportChecksum = checksum(report);

    return {
        report,
        proposal,
        ready: (
            report.summary.ambiguousCases === 0
            && report.summary.unpublishablePhotos === 0
            && report.summary.cutoverPreflightReady
        )
    };
}

function renderReconciliationMarkdown(report) {
    const lines = [
        '# Report riconciliazione inventari media',
        '',
        `- Schema: ${report.schemaVersion}`,
        `- Bucket pubblico: \`${report.provenance.publicBucket}\``,
        `- Bucket privato: \`${report.provenance.privateBucket}\``,
        `- Bucket condiviso: ${report.provenance.sharedBucket ? 'sì' : 'no'}`,
        `- Namespace R2: \`${report.provenance.objectNamespace || '(root)'}\``,
        `- Checksum snapshot sorgente: \`${report.sourceSnapshotChecksum}\``,
        `- Checksum inventario R2: \`${report.r2InventoryChecksum}\``,
        `- Checksum proposta: \`${report.proposalChecksum}\``,
        `- Checksum report: \`${report.reportChecksum}\``,
        '',
        '## Esito',
        '',
        `- Inventari confermati: ${report.summary.confirmedInventories}`,
        `- Asset confermati: ${report.summary.confirmedAssets}`,
        `- Asset mancanti: ${report.summary.missingAssets}`,
        `- Casi ambigui: ${report.summary.ambiguousCases}`,
        `- Oggetti orfani/non inventariati: ${report.summary.orphanObjects}`,
        `- Foto non pubblicabili: ${report.summary.unpublishablePhotos}`,
        `- Foto modificate nella proposta: ${report.summary.proposedPhotoChanges}`,
        `- Preflight cutover: ${report.summary.cutoverPreflightReady ? 'PASS' : 'FAIL'}`,
        `- Note informative del preflight: ${report.preflight.info.length}`,
        ''
    ];
    if (report.missingAssets.length) {
        lines.push('## Asset mancanti', '', '```json', JSON.stringify(report.missingAssets, null, 2), '```', '');
    }
    if (report.ambiguousCases.length) {
        lines.push('## Casi ambigui', '', '```json', JSON.stringify(report.ambiguousCases, null, 2), '```', '');
    }
    if (report.unpublishablePhotos.length) {
        lines.push('## Foto non pubblicabili', '', report.unpublishablePhotos.map((id) => `- ${id}`).join('\n'), '');
    }
    lines.push(
        '## Modifiche proposte',
        '',
        '```json',
        JSON.stringify(report.changes, null, 2),
        '```',
        '',
        'Gli oggetti elencati come orfani non vengono cancellati. La classificazione',
        'indica soltanto che non appartengono all’inventario attivo proposto.',
        ''
    );
    return `${lines.join('\n')}\n`;
}

module.exports = {
    HISTORICAL_DERIVATIVE_FILES,
    RECONCILIATION_SCHEMA_VERSION,
    checksum,
    checksumBytes,
    classifyObservedObject,
    isPhotoInventoryObjectKey,
    normalizeReconciliationProvenance,
    reconcileMediaInventories,
    renderReconciliationMarkdown,
    stableStringify
};
