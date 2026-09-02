CREATE TABLE admin_audit_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    entity_type VARCHAR(20) NOT NULL
        CHECK (entity_type IN ('photo', 'series')),
    entity_id BIGINT NOT NULL CHECK (entity_id > 0),
    operation VARCHAR(80) NOT NULL
        CHECK (operation ~ '^[a-z][a-z0-9.-]{2,79}$'),
    from_version BIGINT CHECK (from_version IS NULL OR from_version > 0),
    to_version BIGINT CHECK (to_version IS NULL OR to_version > 0),
    before_state JSONB,
    after_state JSONB,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(changes) = 'object'),
    operation_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT admin_audit_has_state
        CHECK (before_state IS NOT NULL OR after_state IS NOT NULL),
    CONSTRAINT admin_audit_before_object
        CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
    CONSTRAINT admin_audit_after_object
        CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object')
);

CREATE INDEX admin_audit_events_recent
    ON admin_audit_events (id DESC);

CREATE INDEX admin_audit_events_by_entity
    ON admin_audit_events (entity_type, entity_id, id DESC);

CREATE INDEX admin_audit_events_by_operation
    ON admin_audit_events (operation, id DESC);

CREATE FUNCTION prevent_admin_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_events is append-only';
END;
$$;

CREATE TRIGGER admin_audit_events_append_only
BEFORE UPDATE OR DELETE ON admin_audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_admin_audit_event_mutation();
