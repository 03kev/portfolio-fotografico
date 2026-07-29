CREATE TABLE photo_creation_intents (
    id UUID PRIMARY KEY,
    photo_id BIGINT NOT NULL
        CHECK (photo_id > 0),
    source_path TEXT NOT NULL,
    source_content_type VARCHAR(120) NOT NULL
        CHECK (btrim(source_content_type) <> ''),
    payload_hash CHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    lease_id UUID,
    lease_generation TEXT,
    lease_expires_at TIMESTAMPTZ,
    completed_generation TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT photo_creation_intents_photo_id_unique UNIQUE (photo_id),
    CONSTRAINT photo_creation_intents_source_path_unique UNIQUE (source_path),
    CONSTRAINT photo_creation_intents_lease_generation_ulid
        CHECK (
            lease_generation IS NULL
            OR lease_generation ~ '^[0-9A-HJKMNP-TV-Z]{26}$'
        ),
    CONSTRAINT photo_creation_intents_completed_generation_ulid
        CHECK (
            completed_generation IS NULL
            OR completed_generation ~ '^[0-9A-HJKMNP-TV-Z]{26}$'
        ),
    CONSTRAINT photo_creation_intents_payload_hash_format
        CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT photo_creation_intents_status_check
        CHECK (status IN ('pending', 'processing', 'completed')),
    CONSTRAINT photo_creation_intents_lifecycle_check
        CHECK (
            (
                status = 'pending'
                AND lease_id IS NULL
                AND lease_generation IS NULL
                AND lease_expires_at IS NULL
                AND completed_generation IS NULL
                AND completed_at IS NULL
            )
            OR
            (
                status = 'processing'
                AND payload_hash IS NOT NULL
                AND lease_id IS NOT NULL
                AND lease_generation IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND completed_generation IS NULL
                AND completed_at IS NULL
            )
            OR
            (
                status = 'completed'
                AND payload_hash IS NOT NULL
                AND lease_id IS NULL
                AND lease_generation IS NULL
                AND lease_expires_at IS NULL
                AND completed_generation IS NOT NULL
                AND completed_at IS NOT NULL
            )
        )
);

CREATE INDEX photo_creation_intents_expiry
    ON photo_creation_intents (expires_at)
    WHERE status <> 'completed';

CREATE INDEX photo_creation_intents_active_leases
    ON photo_creation_intents (lease_expires_at)
    WHERE status = 'processing';

ALTER TABLE photos
    ADD COLUMN creation_intent_id UUID,
    ADD CONSTRAINT photos_creation_intent_unique UNIQUE (creation_intent_id),
    ADD CONSTRAINT photos_creation_intent_fk
        FOREIGN KEY (creation_intent_id)
        REFERENCES photo_creation_intents (id)
        ON DELETE RESTRICT;
