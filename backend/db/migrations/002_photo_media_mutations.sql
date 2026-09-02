ALTER TABLE photos
    ADD COLUMN media_generation TEXT,
    ADD COLUMN media_operation_id UUID,
    ADD COLUMN media_operation_kind VARCHAR(40),
    ADD COLUMN media_operation_generation TEXT,
    ADD COLUMN media_operation_expires_at TIMESTAMPTZ;

ALTER TABLE photos
    ADD CONSTRAINT photos_media_generation_format
        CHECK (
            media_generation IS NULL
            OR media_generation ~ '^[a-zA-Z0-9_-]{1,80}$'
        ),
    ADD CONSTRAINT photos_media_operation_complete
        CHECK (
            (
                media_operation_id IS NULL
                AND media_operation_kind IS NULL
                AND media_operation_generation IS NULL
                AND media_operation_expires_at IS NULL
            )
            OR
            (
                media_operation_id IS NOT NULL
                AND media_operation_kind IS NOT NULL
                AND media_operation_generation IS NOT NULL
                AND media_operation_expires_at IS NOT NULL
            )
        ),
    ADD CONSTRAINT photos_media_operation_kind_format
        CHECK (
            media_operation_kind IS NULL
            OR media_operation_kind ~ '^[a-z][a-z0-9-]{1,39}$'
        ),
    ADD CONSTRAINT photos_media_operation_generation_format
        CHECK (
            media_operation_generation IS NULL
            OR media_operation_generation ~ '^[a-zA-Z0-9_-]{1,80}$'
        );

CREATE INDEX photos_active_media_operations
    ON photos (media_operation_expires_at)
    WHERE media_operation_id IS NOT NULL;
