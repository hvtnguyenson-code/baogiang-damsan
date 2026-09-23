DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "capability_definitions"
    WHERE "key" = 'GDDDP_COORDINATOR'
  )
  AND EXISTS (
    SELECT 1
    FROM "capability_definitions"
    WHERE "key" = 'GDDP_COORDINATOR'
  ) THEN
    RAISE EXCEPTION
      'Both legacy and canonical GDĐP coordinator capability keys exist; reconciliation required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "capability_definitions"
    WHERE "key" = 'GDDDP_COORDINATOR'
  ) THEN
    UPDATE "capability_definitions"
    SET
      "key" = 'GDDP_COORDINATOR',
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "key" = 'GDDDP_COORDINATOR';
  END IF;
END
$$;

UPDATE "programme_occurrence_attestations"
SET
  "capability_key" = 'GDDP_COORDINATOR',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "capability_key" = 'GDDDP_COORDINATOR';
