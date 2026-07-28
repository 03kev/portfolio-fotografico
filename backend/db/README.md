# Transactional metadata model

## Authoritative relationships

Membership and editorial usage are separate domain concepts:

- `series_photos` is the only source of truth for which photos belong to a
  series and for their membership order (`position`);
- `series.content` is the source of truth for editorial placement, layout and
  text. A photo may belong to a series without being placed in a block;
- `series.cover_photo_id` is optional, but when present its composite foreign
  key requires the photo to be a member of that same series.

Photo references in `photo` and `photos` content blocks must be a subset of
`series_photos`. PostgreSQL cannot express foreign keys into arbitrary JSONB,
so the series repository validates that invariant inside the same transaction
that writes membership and content.

The order of `series_photos` is not the visual block order. Visual order is
derived from block and group-item layout (`y`, then `x`, then stable ID), as in
the current normalizer.

## Why JSONB remains

Series content is an editorial document with heterogeneous text, photo and
photo-group blocks. Its fields are written and read as one aggregate and are not
queried independently by the backend. Normalizing every block would add joins
and migration surface without improving a real query or invariant.

Photo identity, series identity, membership and cover are relational because
they benefit from uniqueness, ordering and foreign-key enforcement.

## Concurrency rules

| Operation | Transaction/concurrency rule | Conflict |
| --- | --- | --- |
| Create photo | Single insert; stable client-provided ID makes retry detectable | Duplicate ID: `409` |
| Update photo | Transaction locks the photo, rejects active media work and applies the patch | Missing HTTP precondition: `428`; stale expected version: `409` |
| Replace source/crop/regenerate | Short reservation transaction, immutable R2 generation, atomic finalize transaction | Active operation or stale version: `409` |
| Delete photo | Serializable transaction locks the photo, rejects active media work, removes all series references, then deletes it | Missing HTTP precondition: `428`; stale expected version: `409`; serialization/deadlock is retried |
| Create series | Transaction validates all member photos, inserts aggregate and membership | Duplicate title/slug or invalid reference: `409` |
| Update series/content | Transaction locks the aggregate, validates membership/content and replaces the aggregate atomically | Stale expected version: `409` |
| Add/remove/reorder photo | Same series aggregate transaction; cover/content are normalized together | Stale expected version: `409` |
| Delete series | Row delete with optional expected version; memberships cascade | Stale expected version: `409` |

Hard deletes never use upsert, so a stale update cannot recreate a deleted row.
The admin HTTP API requires `If-Match` for updates and deletes when PostgreSQL
is active. Repository callers may still omit `expectedVersion` for explicitly
independent internal patches. Retryable SQL states `40001` and `40P01` are
retried inside the repository; domain/version conflicts are not.

For Neon, `DATABASE_URL` is the pooled connection string used by the serverless
runtime. Migration and import scripts prefer Vercel/Neon's standard
`DATABASE_URL_UNPOOLED` variable, falling back to `DATABASE_URL` outside that
integration. `TEST_DATABASE_URL` must point to an explicitly isolated
database/branch and never falls back to either runtime URL.

Neon currently emits connection strings with `sslmode=require`. The connection
helper upgrades that mode to `verify-full` explicitly, preserving certificate
and hostname verification across the upcoming node-postgres SSL semantics
change.

R2 cannot participate in a PostgreSQL transaction. Media writes therefore use
generation-specific immutable keys: failed work is never referenced, and a
successful finalize changes the database pointer and version atomically. Old or
failed generations are deleted best-effort. A process crash can still leave an
unreferenced R2 generation, but it cannot expose mixed derivatives or stale
metadata; periodic orphan collection may be added independently if storage
growth makes it worthwhile.

## Admin audit history

`admin_audit_events` is an append-only history of photo and series aggregates.
Every event is inserted inside the same transaction as the domain change and
contains:

- entity type and ID;
- operation name and timestamp;
- previous and resulting entity versions;
- complete before/after snapshots;
- a top-level field diff;
- an optional operation UUID and contextual metadata.

Database triggers reject direct `UPDATE` and `DELETE` statements against audit
rows. A failed or rolled-back domain transaction therefore cannot leave an
orphan audit event, and a successful transaction cannot exist without its
corresponding history record.

The history API is admin-authenticated and available only with
`METADATA_BACKEND=postgres`. Snapshots are intentionally retained after entity
deletion so editorial state can be inspected and can support an explicit,
version-checked restore workflow in the future. The audit log itself is never
used as mutable application state.
