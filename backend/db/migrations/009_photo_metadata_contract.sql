-- Missing coordinates are represented as NULL. The geographic origin (0, 0)
-- remains a valid, distinct coordinate pair and existing rows are untouched.
ALTER TABLE photos
    ALTER COLUMN latitude DROP NOT NULL,
    ALTER COLUMN longitude DROP NOT NULL,
    DROP CONSTRAINT photos_location_name_check,
    ADD CONSTRAINT photos_coordinate_pair_check
        CHECK (
            (latitude IS NULL AND longitude IS NULL)
            OR
            (latitude IS NOT NULL AND longitude IS NOT NULL)
        );

COMMENT ON COLUMN photos.location_name IS
    'Editorial location label. Empty string means intentionally unspecified; it is never synthesized by persistence.';

COMMENT ON COLUMN photos.latitude IS
    'Nullable latitude. NULL means unavailable; 0 is a valid geographic value.';

COMMENT ON COLUMN photos.longitude IS
    'Nullable longitude. NULL means unavailable; 0 is a valid geographic value.';
