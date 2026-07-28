ALTER TABLE photos
    DROP CONSTRAINT photos_media_generation_format,
    DROP CONSTRAINT photos_media_operation_generation_format;

ALTER TABLE photos
    ADD CONSTRAINT photos_media_generation_ulid
        CHECK (
            media_generation IS NULL
            OR media_generation ~ '^[0-9A-HJKMNP-TV-Z]{26}$'
        ),
    ADD CONSTRAINT photos_media_operation_generation_ulid
        CHECK (
            media_operation_generation IS NULL
            OR media_operation_generation ~ '^[0-9A-HJKMNP-TV-Z]{26}$'
        );
