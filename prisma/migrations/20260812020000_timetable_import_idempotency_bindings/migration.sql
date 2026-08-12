-- LOCAL-FC-04B3C3A: durable one-to-many request-idempotency bindings.
-- Receipt request fields remain immutable provenance for the original creation request.

CREATE TABLE "timetable_import_request_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "request_key" VARCHAR(200) NOT NULL,
    "request_fingerprint" VARCHAR(128) NOT NULL,
    "bound_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_import_request_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_import_request_keys_request_key_normalized_check" CHECK (
        "request_key" = btrim("request_key") AND "request_key" <> ''
    ),
    CONSTRAINT "timetable_import_request_keys_request_fingerprint_normalized_check" CHECK (
        "request_fingerprint" = btrim("request_fingerprint") AND "request_fingerprint" <> ''
    )
);

CREATE UNIQUE INDEX "timetable_import_request_keys_request_key_key"
    ON "timetable_import_request_keys"("request_key");
CREATE INDEX "timetable_import_request_keys_receipt_id_idx"
    ON "timetable_import_request_keys"("receipt_id");

ALTER TABLE "timetable_import_request_keys"
    ADD CONSTRAINT "timetable_import_request_keys_receipt_id_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "timetable_import_receipts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The existing receipt check requires the key/fingerprint pair to be both null or both present.
-- The globally unique destination index makes conflicting historical keys fail the migration.
DO $$
BEGIN
    IF EXISTS (
        SELECT "request_idempotency_key"
        FROM "timetable_import_receipts"
        WHERE "request_idempotency_key" IS NOT NULL
        GROUP BY "request_idempotency_key"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Conflicting timetable import request keys cannot be backfilled';
    END IF;
END $$;

INSERT INTO "timetable_import_request_keys" (
    "id", "receipt_id", "request_key", "request_fingerprint", "bound_at"
)
SELECT
    gen_random_uuid(),
    "id",
    "request_idempotency_key",
    "request_fingerprint",
    "committed_at"
FROM "timetable_import_receipts"
WHERE "request_idempotency_key" IS NOT NULL
  AND "request_fingerprint" IS NOT NULL;
