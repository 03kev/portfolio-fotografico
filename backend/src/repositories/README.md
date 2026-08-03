# Portfolio repository boundary

The application depends on domain operations, not on metadata documents.

## Contract

`portfolioRepository` exposes:

- `photos.list()`
- `photos.findById(id)`
- `photos.create(photo, options?)`
- `photos.updateById(id, changes, options?)`
- `photos.beginMediaMutation(id, reservation)`
- `photos.getMediaMutation(id)`
- `photos.registerMediaMutationAssets(id, operationId, assets)`
- `photos.markMediaMutationAssetsStored(id, operationId, assetIds?)`
- `photos.completeMediaMutation(id, operationId, changes, options?)`
- `photos.abortMediaMutation(id, operationId)`
- `photoCreations.createOrGet(intent)`
- `photoCreations.claim(intentId, lease)`
- `photoCreations.finalize(intentId, leaseId, photo)`
- `photoCreations.release(intentId, leaseId)`
- `series.list()`
- `series.findByIdentifier(identifier)`
- `series.create(series, options?)`
- `series.updateById(id, changes, options?)`
- `series.deleteById(id, options?)`
- `series.addPhoto(id, photoId, options?)`
- `series.removePhoto(id, photoId, options?)`
- `audit.list(filters?)`
- `audit.findById(id)`
- `mediaCleanup.enqueue(jobs)`
- `mediaCleanup.claimNext(lease)`
- `mediaCleanup.complete(jobId, leaseId)`
- `mediaCleanup.fail(jobId, leaseId, error)`
- `mediaCleanup.getStatus(filters?)`
- `deletePhotoWithReferences(photoId, options?)`

Write operations accept an options object so a transactional implementation can
support an opaque `expectedVersion` and an `idempotencyKey` without changing the
domain operation names. Transaction ownership stays inside aggregate repository
operations; callers do not pass database clients or transaction handles. The
current JSON adapter ignores these options and advertises that limitation
through `capabilities`.

Long-running R2/Sharp work never owns a database transaction. A short
`beginMediaMutation` transaction reserves the photo row and records an expiring
operation ID plus an immutable media generation. `completeMediaMutation`
atomically switches the visible generation and increments `version`; ordinary
metadata updates and deletes reject an active reservation. This is distributed
coordination through Postgres, not a process-local lock.

New photo uploads use a persistent `photo_creation_intents` record. The client
creates the idempotency UUID before requesting a signed URL; replaying that
request returns a URL for the same immutable source path. Finalization claims an
expiring database lease UUID and a lease-specific ULID media generation, performs
R2/Sharp work without a transaction, and then atomically inserts the photo and
marks the intent complete. A completed intent returns the same photo on replay.
Partial output remains owned by the losing lease on its own immutable paths.
Every path is registered in `photo_assets` before R2 work starts and receives a
durable cleanup job in the same transaction. An expired or concurrent worker
can neither overwrite nor delete the generation committed by the winner.

The intent receives its numeric `photoId` from PostgreSQL when it is first
inserted. Preparation replay returns the same allocation. The allocator
resynchronizes against both imported photos and existing intents, so legacy
numeric IDs remain valid without depending on millisecond timestamps. The
photo `created_at` comes from the database timestamp of that intent.

`deletePhotoWithReferences` is one repository operation because deleting a photo
and removing every series reference must become one database transaction. The
JSON adapter retains the metadata-only operation for export/rollback tooling,
but HTTP deletion and every flow that creates or replaces R2 assets require
`capabilities.durableMediaCleanup`. They fail closed with
`TRANSACTIONAL_MEDIA_LIFECYCLE_REQUIRED` while JSON is active.

The PostgreSQL adapter writes immutable audit events in the same transaction as
each aggregate mutation. The JSON adapter deliberately exposes
`capabilities.auditHistory = false`; it does not emulate transactional history
with another JSON document.

The PostgreSQL adapter also exposes durable media cleanup. Each immutable R2
asset is enqueued transactionally with the registration, generation switch or
photo deletion that establishes ownership. Executors claim one row at a time
with `SKIP LOCKED`, use expiring leases and only call R2 after the claim
transaction has committed. The JSON adapter advertises
`capabilities.durableMediaCleanup = false`.

## Photo asset registry

### Source of truth and ownership

`photo_assets` is the only source of truth for an R2 object owned by the photo
lifecycle. A row records:

- logical path and `public`/`private` storage scope;
- semantic role (for example `full`, `mobile`, `social` or `source`);
- replacement group, which defines the complete set replaced atomically;
- photo and immutable ULID generation;
- creation-intent and/or media-operation owner;
- lifecycle state and storage/publication timestamps.

`photos.media_generation` identifies the currently published generation as a
group, but paths and content types are not duplicated on `photos`.
`media_cleanup_jobs` stores only `asset_id`; it never snapshots or reconstructs
path, scope, role, generation or ownership. A cleanup executor must load those
facts from the registry row.

The registry deliberately does not have a foreign key from `photo_id` to
`photos`: planned assets can exist before photo creation, and retired assets and
their cleanup evidence must survive photo deletion. Ownership is instead
enforced by the short transaction that registers or changes asset state.

### Lifecycle

1. `planned`: the row and its future cleanup job are committed before any R2
   PUT or signed upload URL is exposed. A crash or ambiguous R2 response is
   therefore recoverable.
2. `stored_at`: set only after the application receives successful responses
   for all writes it owns. A generation containing unconfirmed assets cannot be
   activated.
3. `active`: publication atomically retires every active row in each replacement
   group produced by the new generation, activates the complete winning set and
   updates the photo generation. `derivatives` is a complete set, so roles
   removed or renamed in the catalog cannot remain active. `source` and
   `creation-staging` are separate and are not touched by a derivative-only
   regeneration.
4. `retired`: no longer published and eligible for durable cleanup.
5. `deleting`: the cleanup claim fences the row before leaving Postgres to call
   R2. A late worker can no longer activate it while deletion is in flight.
6. `deleted`: R2 deletion (also successful when the key was already absent) and
   the job completion are recorded atomically after the executor returns.

A failed R2 deletion leaves the asset fenced as `deleting`; the same durable job
is retried with backoff and an expiring lease. Permanent failures remain visible
through cleanup status. An `active` asset is always cancelled rather than
deleted, even if a stale job exists.

### Adding a generated variant

Generated variants are defined only in `services/photoDerivatives.js`, inside
`PHOTO_DERIVATIVE_VARIANTS`. Add one entry containing:

- unique `role`;
- `scope`, `fileName` and `contentType`;
- a `produce(context)` function returning its buffer.

The catalog helper assigns every generated variant to the `derivatives`
replacement group. Do not create another group for an ordinary generated
variant: doing so would declare it to be an independently published asset set.

Do not add the variant manually to routes, R2 writers, API serializers, cleanup
jobs or path builders. The generator returns descriptors, path materialization
adds photo/generation ownership, writers iterate those descriptors, the
repository registers them, the API exposes public roles under `photo.assets`,
and cleanup follows `asset_id`. Frontend code only needs a change if the new
role must actually be displayed by a new UI feature.

If the role is public, also decide explicitly whether search engines may index
it. Cloudflare response-header rules are infrastructure configuration and cannot
be inferred from this catalog; secondary previews normally need
`X-Robots-Tag: noindex, noimageindex`, while the canonical `full` asset follows
the image SEO policy of the photo page.

The private `source` and temporary `creation-source` are not Sharp derivatives;
their upload flows create descriptors explicitly because their content type and
extension come from the uploaded file. They enter the same registry and
lifecycle.

### Removing or renaming a generated variant

To remove a variant, delete its catalog entry. To rename one, change the
catalog entry's `role`, `fileName` and any format metadata together. Do not add
special cleanup code and do not keep the old role in a compatibility list.

On the next successful crop, regenerate, source replacement or new upload, the
new generation publishes the complete `derivatives` replacement group. Every
active derivative from the previous generation is retired and queued, including
roles no longer present. The active `source` remains untouched unless the same
operation also produced a new source. Existing photos retain their old variant
until they are regenerated; removing a catalog entry does not run a global R2
deletion by itself.

Before removing or renaming a role consumed by the frontend, migrate that UI
consumer in the same change or provide an intentional product-level fallback.
This is a presentation concern only: registration and cleanup remain dynamic.

### Historical data and reconciliation

Migration `008_photo_asset_registry.sql` performs the one-time bridge:

- current generated paths are imported as active rows;
- historical `mobile` is imported only when the former `mobile_image` flag was
  true, so migration never invents an active object that was not generated;
- current private sources are imported as active rows;
- paths already present in the durable cleanup outbox are imported as retired
  rows and their jobs are linked by `asset_id`;
- duplicated path columns are then removed from `photos` and cleanup jobs.

The fixed filenames inside that migration describe only the schema that existed
before the registry. Runtime code must not reuse that list. Fresh JSON snapshot
imports derive generated rows from the current variant catalog and import source
descriptors separately.

Before cutover, verify at minimum:

```sql
-- Every published photo has one active source and one active full asset.
SELECT p.id
FROM photos p
LEFT JOIN photo_assets source
  ON source.photo_id = p.id
 AND source.role = 'source'
 AND source.state = 'active'
LEFT JOIN photo_assets full_asset
  ON full_asset.photo_id = p.id
 AND full_asset.role = 'full'
 AND full_asset.state = 'active'
WHERE source.id IS NULL OR full_asset.id IS NULL;

-- Every cleanup target resolves to exactly one registry row.
SELECT j.id
FROM media_cleanup_jobs j
LEFT JOIN photo_assets a ON a.id = j.asset_id
WHERE a.id IS NULL;
```

This backfill can only register historical paths derivable from metadata and the
old outbox. Objects placed directly in R2 outside the application require a
separate inventory reconciliation before deletion; the application must not
guess ownership from a filename.

## Intended SQL ownership

Relational data:

- `photos`: identity, searchable metadata, active generation and version.
- `photo_assets`: authoritative R2 paths, roles, scopes, ownership and lifecycle.
- `series`: identity, unique title key and slug, publication state, cover photo,
  timestamps and version.
- `series_photos`: ordered many-to-many membership with foreign keys.

Editorial JSON:

- the series block document and per-block layout/style remain JSON;
- photo IDs referenced by `photo` and `photos` blocks are validated by the
  domain service in the same transaction as series membership changes;
- `{ id, layout }` group items are parsed by ID, rather than treated as numeric
  values.

The database should enforce primary keys, unique series identity, foreign keys
for cover and membership, and monotone version increments. Domain validation
remains responsible for block shape, layout bounds and consistency between the
editorial document and `series_photos`.

## Adapter selection

`METADATA_BACKEND=postgres` explicitly creates
`PostgresPortfolioRepository` from `DATABASE_URL`. Until the production
cutover, the fail-safe runtime fallback remains the transitional JSON adapter.
It can still read and update ordinary metadata, but it cannot create or delete
photos, crop/regenerate derivatives, or replace a source through the HTTP API.
Creation returns `TRANSACTIONAL_PHOTO_CREATION_REQUIRED`; existing-photo media
operations return `TRANSACTIONAL_MEDIA_LIFECYCLE_REQUIRED`. There is
deliberately no dual-write path.
