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
| Update photo | Atomic partial `UPDATE`; optional `expectedVersion` predicate | Stale expected version: `409` |
| Delete photo | Serializable transaction locks the photo, removes all series references, then deletes it | Stale expected version: `409`; serialization/deadlock is retried |
| Create series | Transaction validates all member photos, inserts aggregate and membership | Duplicate title/slug or invalid reference: `409` |
| Update series/content | Transaction locks the aggregate, validates membership/content and replaces the aggregate atomically | Stale expected version: `409` |
| Add/remove/reorder photo | Same series aggregate transaction; cover/content are normalized together | Stale expected version: `409` |
| Delete series | Row delete with optional expected version; memberships cascade | Stale expected version: `409` |

Hard deletes never use upsert, so a stale update cannot recreate a deleted row.
`expectedVersion` is useful for editor-style whole-aggregate writes and is not
required for independent atomic photo patches. Retryable SQL states `40001` and
`40P01` are retried inside the repository; domain/version conflicts are not.

For Neon, `DATABASE_URL` should be the pooled connection string used by the
serverless runtime. Migration and import scripts prefer `DATABASE_DIRECT_URL`
so schema changes and the one-shot import do not depend on transaction-pooler
behavior.

R2 object operations intentionally remain outside this model for now. The
database transaction guarantees metadata integrity, but media/database atomicity
requires the later saga/outbox phase.
