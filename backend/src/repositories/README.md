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
Partial output remains owned by the losing lease on its own immutable paths, so
an expired or concurrent worker can neither overwrite nor delete the generation
committed by the winner.

The intent receives its numeric `photoId` from PostgreSQL when it is first
inserted. Preparation replay returns the same allocation. The allocator
resynchronizes against both imported photos and existing intents, so legacy
numeric IDs remain valid without depending on millisecond timestamps. The
photo `created_at` comes from the database timestamp of that intent.

`deletePhotoWithReferences` is one repository operation because deleting a photo
and removing every series reference must become one database transaction. It is
only best-effort in `JsonPortfolioRepository`; therefore the persistence P0 is
not considered fixed while this adapter is active.

The PostgreSQL adapter writes immutable audit events in the same transaction as
each aggregate mutation. The JSON adapter deliberately exposes
`capabilities.auditHistory = false`; it does not emulate transactional history
with another JSON document.

## Intended SQL ownership

Relational data:

- `photos`: identity, searchable metadata, source/derivative state, version.
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
It can still read and update legacy metadata, but it cannot create new photos
and returns `TRANSACTIONAL_PHOTO_CREATION_REQUIRED` for the admin upload
protocol. There is deliberately no dual-write path.
