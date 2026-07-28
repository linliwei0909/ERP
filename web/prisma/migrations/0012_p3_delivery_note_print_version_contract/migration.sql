BEGIN;

-- Identify the already-approved P3.2 frozen snapshot contract without
-- rebuilding, wrapping, or otherwise changing any existing snapshot JSON.
ALTER TABLE "delivery_notes"
  ADD COLUMN "snapshot_version" VARCHAR(100);

UPDATE "delivery_notes"
   SET "snapshot_version" = 'delivery-note-snapshot-v1';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "delivery_notes"
     WHERE "snapshot_version" IS NULL
        OR btrim("snapshot_version") = ''
  ) THEN
    RAISE EXCEPTION
      'P3.3b2 migration failed: delivery note snapshot version backfill is incomplete'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

ALTER TABLE "delivery_notes"
  ALTER COLUMN "snapshot_version" SET NOT NULL,
  ADD CONSTRAINT "delivery_notes_snapshot_version_check"
    CHECK (btrim("snapshot_version") <> '');

-- No renderer existed before this contract supplement. Existing rows cannot
-- be assigned renderer, font, or snapshot identities safely, so abort instead
-- of inventing placeholders or deleting historical data.
DO $$
DECLARE
  existing_print_version_count BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO existing_print_version_count
    FROM "delivery_note_print_versions";

  IF existing_print_version_count > 0 THEN
    RAISE EXCEPTION
      'P3.3b2 migration failed: delivery_note_print_versions contains % existing row(s); renderer, font, and snapshot versions require source verification',
      existing_print_version_count
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

ALTER TABLE "delivery_note_print_versions"
  ADD COLUMN "renderer_version" VARCHAR(100) NOT NULL,
  ADD COLUMN "font_version" VARCHAR(100) NOT NULL,
  ADD COLUMN "snapshot_version" VARCHAR(100) NOT NULL,
  ADD CONSTRAINT "delivery_note_print_versions_renderer_version_check"
    CHECK (btrim("renderer_version") <> ''),
  ADD CONSTRAINT "delivery_note_print_versions_font_version_check"
    CHECK (btrim("font_version") <> ''),
  ADD CONSTRAINT "delivery_note_print_versions_snapshot_version_check"
    CHECK (btrim("snapshot_version") <> '');

-- No database defaults are installed. New Delivery Notes and future formal
-- print versions must always persist their domain contract versions explicitly.
COMMIT;
