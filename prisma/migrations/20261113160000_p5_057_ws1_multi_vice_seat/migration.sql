-- P5-057 WS1: preserve exclusive seats while allowing multiple academic VPs.
-- Forward-only migration: do not edit the applied B1 foundation migration.
-- Non-VP appointments remain exclusive per seat; VPs exclusive per (seat, holder).
-- No data backfill, grant update or mutation of existing appointment records.
BEGIN;
ALTER TABLE role_appointments DROP CONSTRAINT role_appointments_seat_no_overlap;
ALTER TABLE role_appointments ADD CONSTRAINT role_appointments_seat_no_overlap
EXCLUDE USING gist (
  seat_id WITH =,
  tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)') WITH &&
) WHERE (seat_id IS NOT NULL AND cancelled_at IS NULL
         AND template_key <> 'VICE_PRINCIPAL_ACADEMIC');
ALTER TABLE role_appointments ADD CONSTRAINT role_appointments_vice_same_holder_no_overlap
EXCLUDE USING gist (
  seat_id WITH =,
  user_id WITH =,
  tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)') WITH &&
) WHERE (seat_id IS NOT NULL AND cancelled_at IS NULL
         AND template_key = 'VICE_PRINCIPAL_ACADEMIC');
COMMIT;
