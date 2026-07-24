CREATE TABLE IF NOT EXISTS portfolio_schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE photos (
    id BIGINT PRIMARY KEY CHECK (id > 0),
    title VARCHAR(120) NOT NULL CHECK (char_length(btrim(title)) >= 3),
    description VARCHAR(4000) NOT NULL DEFAULT '',
    date_taken VARCHAR(40) NOT NULL,
    location_name VARCHAR(160) NOT NULL CHECK (btrim(location_name) <> ''),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    camera VARCHAR(120) NOT NULL DEFAULT '',
    lens VARCHAR(120) NOT NULL DEFAULT '',
    resolution VARCHAR(120) NOT NULL DEFAULT '',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(settings) = 'object'),
    tags TEXT[] NOT NULL DEFAULT '{}'::text[]
        CHECK (cardinality(tags) <= 20),
    source_path TEXT NOT NULL DEFAULT '',
    source_content_type VARCHAR(120) NOT NULL DEFAULT '',
    mobile_image BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at_ms BIGINT NOT NULL DEFAULT 0 CHECK (updated_at_ms >= 0),
    derivatives_version BIGINT NOT NULL CHECK (derivatives_version > 0),
    created_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX photos_source_path_unique
    ON photos (source_path)
    WHERE source_path <> '';

CREATE TABLE series (
    id BIGINT PRIMARY KEY CHECK (id > 0),
    title VARCHAR(120) NOT NULL CHECK (btrim(title) <> ''),
    title_key VARCHAR(240) NOT NULL CHECK (btrim(title_key) <> ''),
    slug VARCHAR(140) NOT NULL
        CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    description VARCHAR(8000) NOT NULL CHECK (btrim(description) <> ''),
    cover_photo_id BIGINT,
    content JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(content) = 'array'),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    CONSTRAINT series_title_key_unique UNIQUE (title_key),
    CONSTRAINT series_slug_unique UNIQUE (slug)
);

CREATE INDEX series_publication_order
    ON series (published, created_at, id);

CREATE TABLE series_photos (
    series_id BIGINT NOT NULL,
    photo_id BIGINT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (series_id, photo_id),
    CONSTRAINT series_photos_position_unique
        UNIQUE (series_id, position)
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT series_photos_series_fk
        FOREIGN KEY (series_id)
        REFERENCES series (id)
        ON DELETE CASCADE,
    CONSTRAINT series_photos_photo_fk
        FOREIGN KEY (photo_id)
        REFERENCES photos (id)
        ON DELETE RESTRICT
);

CREATE INDEX series_photos_by_photo
    ON series_photos (photo_id, series_id);

ALTER TABLE series
    ADD CONSTRAINT series_cover_membership_fk
    FOREIGN KEY (id, cover_photo_id)
    REFERENCES series_photos (series_id, photo_id)
    DEFERRABLE INITIALLY DEFERRED;
