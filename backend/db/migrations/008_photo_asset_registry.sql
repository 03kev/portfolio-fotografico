CREATE TABLE photo_assets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    object_namespace TEXT NOT NULL DEFAULT '',
    photo_id BIGINT NOT NULL,
    generation TEXT,
    role VARCHAR(80) NOT NULL,
    replacement_group VARCHAR(80) NOT NULL,
    storage_scope VARCHAR(20) NOT NULL,
    logical_path TEXT NOT NULL,
    content_type VARCHAR(160) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'planned',
    owner_upload_intent_id UUID,
    owner_media_operation_id UUID,
    stored_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT photo_assets_namespace_path_unique
        UNIQUE (object_namespace, storage_scope, logical_path),
    CONSTRAINT photo_assets_namespace_check
        CHECK (
            object_namespace = ''
            OR (
                object_namespace ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$'
                AND object_namespace !~ '(^|/)\.{1,2}(/|$)'
            )
        ),
    CONSTRAINT photo_assets_photo_id_check CHECK (photo_id > 0),
    CONSTRAINT photo_assets_generation_ulid
        CHECK (generation IS NULL OR generation ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
    CONSTRAINT photo_assets_role_check CHECK (role ~ '^[a-z][a-z0-9-]{1,79}$'),
    CONSTRAINT photo_assets_replacement_group_check
        CHECK (replacement_group ~ '^[a-z][a-z0-9-]{1,79}$'),
    CONSTRAINT photo_assets_scope_check CHECK (storage_scope IN ('public', 'private')),
    CONSTRAINT photo_assets_path_check
        CHECK (
            (storage_scope = 'public' AND logical_path LIKE '/uploads/%')
            OR
            (storage_scope = 'private' AND logical_path LIKE '/private/%')
        ),
    CONSTRAINT photo_assets_content_type_check
        CHECK (content_type ~ '^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$'),
    CONSTRAINT photo_assets_state_check
        CHECK (state IN ('planned', 'active', 'retired', 'deleting', 'deleted')),
    CONSTRAINT photo_assets_lifecycle_check
        CHECK (
            (state = 'planned' AND activated_at IS NULL AND retired_at IS NULL AND deleted_at IS NULL)
            OR
            (state = 'active' AND activated_at IS NOT NULL AND retired_at IS NULL AND deleted_at IS NULL)
            OR
            (state = 'retired' AND retired_at IS NOT NULL AND deleted_at IS NULL)
            OR
            (state = 'deleting' AND deleted_at IS NULL)
            OR
            (state = 'deleted' AND deleted_at IS NOT NULL)
        )
);

CREATE UNIQUE INDEX photo_assets_one_active_role
    ON photo_assets (object_namespace, photo_id, role)
    WHERE state = 'active';

CREATE INDEX photo_assets_photo_state
    ON photo_assets (object_namespace, photo_id, state, role);

CREATE INDEX photo_assets_operation
    ON photo_assets (owner_media_operation_id)
    WHERE owner_media_operation_id IS NOT NULL;

CREATE INDEX photo_assets_intent
    ON photo_assets (owner_upload_intent_id)
    WHERE owner_upload_intent_id IS NOT NULL;

-- Historical import. These filenames describe the schema that existed before
-- the registry; runtime code must never rebuild assets from this list.
INSERT INTO photo_assets (
    object_namespace, photo_id, generation, role, replacement_group, storage_scope,
    logical_path, content_type, state, activated_at, stored_at
)
SELECT COALESCE(NULLIF(current_setting('app.r2_object_prefix', true), ''), ''),
       p.id, p.media_generation, variant.role, 'derivatives', 'public',
       '/uploads/photos/' || p.id || '/' || p.media_generation || '/' || variant.file_name,
       variant.content_type, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM photos p
CROSS JOIN (VALUES
    ('full', 'full.webp', 'image/webp'),
    ('mobile', 'mobile.webp', 'image/webp'),
    ('thumbnail-4x3', 'thumbnail-4x3.webp', 'image/webp'),
    ('thumbnail-1x1', 'thumbnail-1x1.webp', 'image/webp'),
    ('social', 'social.jpg', 'image/jpeg')
) AS variant(role, file_name, content_type)
WHERE p.media_generation IS NOT NULL
  AND (variant.role <> 'mobile' OR p.mobile_image IS TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO photo_assets (
    object_namespace, photo_id, generation, role, replacement_group, storage_scope,
    logical_path, content_type, state, activated_at, stored_at
)
SELECT COALESCE(NULLIF(current_setting('app.r2_object_prefix', true), ''), ''),
       p.id, p.media_generation, 'source', 'source', 'private', p.source_path,
       COALESCE(NULLIF(p.source_content_type, ''), 'application/octet-stream'),
       'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM photos p
WHERE NULLIF(p.source_path, '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Register every path already known by the durable cleanup outbox. This also
-- imports abandoned generations and creation staging paths.
INSERT INTO photo_assets (
    object_namespace, photo_id, generation, role, replacement_group, storage_scope,
    logical_path, content_type, state, owner_upload_intent_id,
    owner_media_operation_id, retired_at
)
SELECT j.object_namespace,
       COALESCE(j.photo_id, i.photo_id),
       j.generation,
       CASE
           WHEN j.guard_type = 'creation-staging' THEN 'creation-source'
           WHEN j.logical_path ~ '/source\.[^/]+$' THEN 'source'
           WHEN j.logical_path LIKE '%/full.webp' THEN 'full'
           WHEN j.logical_path LIKE '%/mobile.webp' THEN 'mobile'
           WHEN j.logical_path LIKE '%/thumbnail-4x3.webp' THEN 'thumbnail-4x3'
           WHEN j.logical_path LIKE '%/thumbnail-1x1.webp' THEN 'thumbnail-1x1'
           WHEN j.logical_path LIKE '%/social.jpg' THEN 'social'
           ELSE 'historical-asset-' || j.id
       END,
       CASE
           WHEN j.guard_type = 'creation-staging' THEN 'creation-staging'
           WHEN j.logical_path ~ '/source\.[^/]+$' THEN 'source'
           WHEN j.storage_scope = 'public' THEN 'derivatives'
           ELSE 'historical'
       END,
       j.storage_scope,
       j.logical_path,
       CASE
           WHEN j.logical_path LIKE '%.webp' THEN 'image/webp'
           WHEN j.logical_path LIKE '%.jpg' OR j.logical_path LIKE '%.jpeg' THEN 'image/jpeg'
           WHEN j.logical_path LIKE '%.png' THEN 'image/png'
           ELSE 'application/octet-stream'
       END,
       'retired',
       j.upload_intent_id,
       j.media_operation_id,
       CURRENT_TIMESTAMP
FROM media_cleanup_jobs j
LEFT JOIN photo_creation_intents i ON i.id = j.upload_intent_id
ON CONFLICT DO NOTHING;

ALTER TABLE media_cleanup_jobs ADD COLUMN asset_id BIGINT;

UPDATE media_cleanup_jobs j
SET asset_id = a.id
FROM photo_assets a
WHERE a.object_namespace = j.object_namespace
  AND a.storage_scope = j.storage_scope
  AND a.logical_path = j.logical_path;

ALTER TABLE media_cleanup_jobs
    ALTER COLUMN asset_id SET NOT NULL,
    ADD CONSTRAINT media_cleanup_jobs_asset_fk
        FOREIGN KEY (asset_id) REFERENCES photo_assets(id) ON DELETE RESTRICT;

CREATE INDEX media_cleanup_jobs_asset ON media_cleanup_jobs (asset_id);

COMMENT ON TABLE photo_assets IS
    'Authoritative registry for every R2 object owned by a photo lifecycle.';

COMMENT ON COLUMN photo_assets.state IS
    'planned before an R2 write, active after publication, retired while awaiting cleanup, deleting as the cleanup fence, deleted after idempotent R2 deletion.';

COMMENT ON COLUMN photo_assets.replacement_group IS
    'Assets in one group form a complete replacement set. Publishing derivatives retires every previous derivative role, including removed or renamed variants, without touching source or staging groups.';

COMMENT ON COLUMN photo_assets.photo_id IS
    'Intentionally not a FK: planned assets precede photos and cleanup records outlive deleted photos.';

COMMENT ON COLUMN media_cleanup_jobs.asset_id IS
    'Cleanup target. Scope, path and ownership are read exclusively from photo_assets.';

-- The registry is authoritative after the backfill. Keeping path and ownership
-- snapshots on photos or cleanup jobs would recreate the same drift this
-- migration is intended to eliminate.
DROP INDEX IF EXISTS photos_source_path_unique;

ALTER TABLE photos
    DROP COLUMN source_path,
    DROP COLUMN source_content_type,
    DROP COLUMN mobile_image;

ALTER TABLE media_cleanup_jobs
    DROP COLUMN storage_scope,
    DROP COLUMN logical_path,
    DROP COLUMN guard_type,
    DROP COLUMN photo_id,
    DROP COLUMN generation,
    DROP COLUMN upload_intent_id,
    DROP COLUMN media_operation_id;
