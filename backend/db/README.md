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
| Create photo | Persistent idempotency intent, expiring processing lease, lease-specific immutable generation, atomic intent+photo finalize | Different payload on replay, active lease or duplicate ID: `409`; expired intent: `410` |
| Update photo | Transaction locks the photo, rejects active media work and applies the patch | Missing HTTP precondition: `428`; stale expected version: `409` |
| Replace source/crop/regenerate | Short reservation transaction, immutable R2 generation, atomic finalize transaction | Active operation or stale version: `409` |
| Delete photo | Serializable transaction locks the photo, rejects active media work, removes all series references, then deletes it | Missing HTTP precondition: `428`; stale expected version: `409`; serialization/deadlock is retried |
| Create series | Transaction validates all member photos, inserts aggregate and membership | Duplicate title/slug or invalid reference: `409` |
| Update series/content | Transaction locks the aggregate, validates membership/content and replaces the aggregate atomically | Stale expected version: `409` |
| Add/remove/reorder photo | Same series aggregate transaction; cover/content are normalized together | Stale expected version: `409` |
| Delete series | Row delete with optional expected version; memberships cascade | Stale expected version: `409` |

Hard deletes never use upsert, so a stale update cannot recreate a deleted row.
The admin HTTP API requires `X-Expected-Version` for updates and deletes when
PostgreSQL is active. The standard HTTP `If-Match` header remains accepted only
as a backwards-compatible fallback: application clients avoid it because an
intermediary CDN may evaluate it against the response ETag after an unsafe
request has already reached the origin. Repository callers may still omit
`expectedVersion` for explicitly independent internal patches. Retryable SQL
states `40001` and `40P01` are retried inside the repository; domain/version
conflicts are not.

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
ULID generation-specific immutable keys: failed work is never referenced, and
a successful finalize changes the database pointer and version atomically.
For a new photo, the direct-upload source first belongs to the persistent
`photo_creation_intents` record. Each processing lease receives a different
output generation and copies the source plus derivatives there. This is a
fencing mechanism: the lease UUID authorizes database finalization, while its
ULID generation isolates every R2 path. There is intentionally no lease
counter. A worker that resumes after its lease expires can still write only to
its own generation and cannot finalize unless its UUID is still the active
lease. The short final transaction inserts the photo and marks that exact
generation complete; replay returns the same row without invoking Sharp or R2
again.

## Photo creation intent retention

`expires_at` is the retry window for unfinished work, not a lifetime for every
intent:

- a `pending` intent expires after the configured preparation TTL (currently
  24 hours);
- a `processing` intent keeps the same intent expiry and additionally has a
  short lease expiry. An expired lease can be reclaimed only while the intent
  itself is still valid;
- a `completed` intent remains linked to its photo indefinitely and acts as the
  authoritative idempotency record;
- if that photo is later deleted, the completed intent remains as a tombstone,
  so replay returns `PHOTO_UPLOAD_RESULT_GONE` and cannot recreate the photo.

Preparing an already completed intent never emits another signed upload URL.
It returns `PHOTO_UPLOAD_ALREADY_COMPLETED`, or
`PHOTO_UPLOAD_RESULT_GONE` when its photo was deleted.

`media_cleanup_jobs` is the durable deletion outbox for resources whose
ownership is provable: expired pending intents, expired processing leases,
abandoned staging objects, replaced generations and assets of deleted photos.
Completed intents linked to live photos and deletion tombstones have different
retention requirements and are not treated as 24-hour temporary rows.

Each row identifies one logical public or private path, the exact R2 namespace,
its ownership guard and an idempotency key. Enqueue happens inside the same
PostgreSQL transaction that reserves a lease/generation, switches the active
generation or deletes a photo. A failed release or abort leaves the already
scheduled job intact. R2 is never called from those transactions.

Executors claim rows with `FOR UPDATE SKIP LOCKED` and a short UUID lease.
Transient errors return to `pending` with exponential backoff; permanent
errors and exhausted attempts remain `failed` with their code and message.
`attempts` counts executor acquisitions, including acquisitions that end in a
crash. An expired processing lease is reclaimable only while `attempts <
max_attempts`; at the limit it becomes an observable `failed` job rather than
being retried forever. Replays before that limit remain safe because R2
deletion is idempotent.

Before claiming a generation, the repository locks and checks the current
photo and creation intent. An active photo generation is cancelled, while a
still-valid media/creation lease is deferred beyond its fencing grace period.
Failed and aborted work keeps that same grace period rather than being made
immediately claimable: signed upload URLs and already-started R2 requests may
outlive the HTTP request that launched them.
The executor also rejects a job whose recorded namespace differs from
`R2_OBJECT_PREFIX`, preventing a production runtime from deleting Preview
objects and vice versa.

Production uses the protected daily Vercel Cron endpoint
`GET /api/internal/media-cleanup/run`; admin operations also run a small
best-effort batch to keep normal latency low. Preview has no scheduled cron,
so it relies on those opportunistic batches or the admin-only
`POST /api/internal/media-cleanup/run`. Both execution paths honor
`METADATA_WRITES_ENABLED`; a Preview additionally needs a non-empty
`R2_OBJECT_PREFIX`, even if it shares a database with production. Permanent
failures are visible through the admin-only
`GET /api/internal/media-cleanup/status` endpoint.

Explicit executor budgets prevent cleanup from consuming the whole serverless
invocation: scheduled/manual batches use 8 seconds, while opportunistic
request-path batches use 1.5 seconds. Each R2 DeleteObject also receives an
abort signal bounded by the remaining budget. No global `maxDuration` is set on
`api/index.js`, because that single Express function also serves uploads and
other potentially longer API operations.

Public derivative generations and private source revisions are intentionally
independent: crop/regenerate creates a new derivative generation without
copying the full-resolution source, while source replacement creates both.
Old or failed generations are now enqueued durably. A future reconciliation
scanner may still be useful for historical objects created before this outbox,
or for an extraordinary failure between an R2 write and the prior durable
reservation, but it is not part of the request path.

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
