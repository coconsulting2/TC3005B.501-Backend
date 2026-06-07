-- Optional trip name / motive for travel requests (required in API for new requests).

BEGIN;

ALTER TABLE "Request"
  ADD COLUMN IF NOT EXISTS trip_name VARCHAR(120);

COMMIT;
