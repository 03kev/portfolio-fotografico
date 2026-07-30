CREATE TABLE media_cleanup_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dedupe_key TEXT NOT NULL,
    object_namespace TEXT NOT NULL DEFAULT '',
    storage_scope VARCHAR(20) NOT NULL,
    logical_path TEXT NOT NULL,
    reason VARCHAR(80) NOT NULL,
    guard_type VARCHAR(40) NOT NULL,
    photo_id BIGINT,
    generation TEXT,
    upload_intent_id UUID,
    media_operation_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 8,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_id UUID,
    lease_expires_at TIMESTAMPTZ,
    last_error_code VARCHAR(120),
    last_error_message TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT media_cleanup_jobs_dedupe_unique UNIQUE (dedupe_key),
    CONSTRAINT media_cleanup_jobs_namespace_check
        CHECK (
            object_namespace = ''
            OR (
                object_namespace ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$'
                AND object_namespace !~ '(^|/)\.{1,2}(/|$)'
            )
        ),
    CONSTRAINT media_cleanup_jobs_scope_check
        CHECK (storage_scope IN ('public', 'private')),
    CONSTRAINT media_cleanup_jobs_path_check
        CHECK (
            (storage_scope = 'public' AND logical_path LIKE '/uploads/%')
            OR
            (storage_scope = 'private' AND logical_path LIKE '/private/%')
        ),
    CONSTRAINT media_cleanup_jobs_reason_check
        CHECK (reason ~ '^[a-z][a-z0-9-]{1,79}$'),
    CONSTRAINT media_cleanup_jobs_guard_check
        CHECK (guard_type IN ('photo-generation', 'creation-staging')),
    CONSTRAINT media_cleanup_jobs_generation_ulid
        CHECK (
            generation IS NULL
            OR generation ~ '^[0-9A-HJKMNP-TV-Z]{26}$'
        ),
    CONSTRAINT media_cleanup_jobs_guard_shape
        CHECK (
            (
                guard_type = 'photo-generation'
                AND photo_id IS NOT NULL
                AND generation IS NOT NULL
                AND upload_intent_id IS NULL
            )
            OR
            (
                guard_type = 'creation-staging'
                AND photo_id IS NULL
                AND generation IS NULL
                AND upload_intent_id IS NOT NULL
                AND media_operation_id IS NULL
            )
        ),
    CONSTRAINT media_cleanup_jobs_status_check
        CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
    CONSTRAINT media_cleanup_jobs_attempts_check
        CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 100),
    CONSTRAINT media_cleanup_jobs_lease_check
        CHECK (
            (
                status = 'processing'
                AND lease_id IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND completed_at IS NULL
            )
            OR
            (
                status IN ('pending', 'failed')
                AND lease_id IS NULL
                AND lease_expires_at IS NULL
                AND completed_at IS NULL
            )
            OR
            (
                status IN ('succeeded', 'cancelled')
                AND lease_id IS NULL
                AND lease_expires_at IS NULL
                AND completed_at IS NOT NULL
            )
        )
);

CREATE INDEX media_cleanup_jobs_claimable
    ON media_cleanup_jobs (available_at, id)
    WHERE status IN ('pending', 'processing');

CREATE INDEX media_cleanup_jobs_failed
    ON media_cleanup_jobs (updated_at DESC, id DESC)
    WHERE status = 'failed';

CREATE INDEX media_cleanup_jobs_photo_generation
    ON media_cleanup_jobs (photo_id, generation)
    WHERE guard_type = 'photo-generation';

CREATE INDEX media_cleanup_jobs_upload_intent
    ON media_cleanup_jobs (upload_intent_id)
    WHERE guard_type = 'creation-staging';

COMMENT ON TABLE media_cleanup_jobs IS
    'Durable, idempotent R2 deletion outbox. Paths are logical; object_namespace fences production and preview.';

COMMENT ON COLUMN media_cleanup_jobs.available_at IS
    'Earliest claim time; also carries retry backoff and stale-writer grace periods.';

COMMENT ON COLUMN media_cleanup_jobs.attempts IS
    'Number of executor acquisitions, including acquisitions that end by lease expiry.';

COMMENT ON COLUMN media_cleanup_jobs.max_attempts IS
    'Maximum executor acquisitions; an expired final lease becomes a terminal failed job.';
