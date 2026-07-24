# Portfolio repository boundary

The application depends on domain operations, not on metadata documents.

## Contract

`portfolioRepository` exposes:

- `photos.list()`
- `photos.findById(id)`
- `photos.create(photo, options?)`
- `photos.updateById(id, changes, options?)`
- `series.list()`
- `series.findByIdentifier(identifier)`
- `series.create(series, options?)`
- `series.updateById(id, changes, options?)`
- `series.deleteById(id, options?)`
- `series.addPhoto(id, photoId, options?)`
- `series.removePhoto(id, photoId, options?)`
- `deletePhotoWithReferences(photoId, options?)`

Write operations accept an options object so a transactional implementation can
support an opaque `expectedVersion` and an `idempotencyKey` without changing the
domain operation names. Transaction ownership stays inside aggregate repository
operations; callers do not pass database clients or transaction handles. The
current JSON adapter ignores these options and advertises that limitation
through `capabilities`.

`deletePhotoWithReferences` is one repository operation because deleting a photo
and removing every series reference must become one database transaction. It is
only best-effort in `JsonPortfolioRepository`; therefore the persistence P0 is
not considered fixed while this adapter is active.

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

`METADATA_BACKEND=json` remains the default during the migration phase.
`METADATA_BACKEND=postgres` creates `PostgresPortfolioRepository` from
`DATABASE_URL`. There is deliberately no dual-write path.
