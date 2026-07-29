CREATE SEQUENCE portfolio_photo_id_seq
    AS BIGINT
    MINVALUE 1
    MAXVALUE 9007199254740991;

SELECT setval(
    'portfolio_photo_id_seq',
    GREATEST(
        COALESCE((SELECT MAX(id) FROM photos), 0),
        COALESCE((SELECT MAX(photo_id) FROM photo_creation_intents), 0),
        1
    ),
    EXISTS (
        SELECT 1 FROM photos
        UNION ALL
        SELECT 1 FROM photo_creation_intents
    )
);

CREATE FUNCTION allocate_portfolio_photo_id()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    highest_persisted_id BIGINT;
    current_sequence_id BIGINT;
    sequence_was_called BOOLEAN;
    allocated_id BIGINT;
BEGIN
    -- Serialize only ID allocation. R2 and Sharp never run while this lock is held.
    PERFORM pg_advisory_xact_lock(734682901244114733);

    SELECT GREATEST(
        COALESCE((SELECT MAX(id) FROM photos), 0),
        COALESCE((SELECT MAX(photo_id) FROM photo_creation_intents), 0)
    )
    INTO highest_persisted_id;

    SELECT last_value, is_called
    INTO current_sequence_id, sequence_was_called
    FROM portfolio_photo_id_seq;

    IF
        highest_persisted_id > current_sequence_id
        OR (
            highest_persisted_id = current_sequence_id
            AND NOT sequence_was_called
        )
    THEN
        PERFORM setval(
            'portfolio_photo_id_seq',
            highest_persisted_id,
            TRUE
        );
    END IF;

    allocated_id := nextval('portfolio_photo_id_seq');
    IF allocated_id > 9007199254740991 THEN
        RAISE EXCEPTION 'photo ID space exhausted'
            USING ERRCODE = '22003';
    END IF;
    RETURN allocated_id;
END;
$$;

ALTER TABLE photo_creation_intents
    ALTER COLUMN photo_id
    SET DEFAULT allocate_portfolio_photo_id();

COMMENT ON SEQUENCE portfolio_photo_id_seq IS
    'Allocates numeric photo IDs after all imported and previously reserved IDs.';

COMMENT ON FUNCTION allocate_portfolio_photo_id() IS
    'Allocates a JavaScript-safe BIGINT and resynchronizes after explicit legacy imports.';

COMMENT ON COLUMN photo_creation_intents.expires_at IS
    'Expiry for pending or processing upload work only; completed intents are retained as idempotency tombstones.';
