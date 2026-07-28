BEGIN;

-- P3.3b has no safe synthetic backfill for already-shipped documents. Abort
-- before creating any catalog object so the transaction can roll back cleanly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "delivery_notes"
     WHERE "status" IN ('SHIPPED', 'RECEIVABLE_CREATED')
  ) THEN
    RAISE EXCEPTION
      'P3.3b preflight failed: shipped delivery notes require complete print storage data'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- CreateEnum
CREATE TYPE "delivery_note_print_event_type" AS ENUM ('FORMAL_PRINT', 'REPRINT');

-- AlterTable
ALTER TABLE "delivery_notes"
  ADD COLUMN "actual_delivery_date" DATE,
  ADD COLUMN "first_printed_at" TIMESTAMPTZ(3),
  ADD COLUMN "first_printed_by" UUID,
  ADD COLUMN "reprint_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "delivery_note_print_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "delivery_note_id" UUID NOT NULL,
    "document_version" INTEGER NOT NULL DEFAULT 1,
    "template_version" VARCHAR(100) NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" UUID NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "pdf_bytes" BYTEA NOT NULL,

    CONSTRAINT "delivery_note_print_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_note_print_versions_document_version_check"
      CHECK ("document_version" = 1),
    CONSTRAINT "delivery_note_print_versions_template_version_check"
      CHECK (btrim("template_version") <> ''),
    CONSTRAINT "delivery_note_print_versions_content_hash_check"
      CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "delivery_note_print_versions_mime_type_check"
      CHECK ("mime_type" = 'application/pdf'),
    CONSTRAINT "delivery_note_print_versions_byte_size_check"
      CHECK (
        "byte_size" >= 1
        AND "byte_size" <= 20971520
        AND octet_length("pdf_bytes") = "byte_size"
      ),
    CONSTRAINT "delivery_note_print_versions_filename_check"
      CHECK (btrim("filename") <> '')
);

-- CreateTable
CREATE TABLE "delivery_note_print_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "delivery_note_id" UUID NOT NULL,
    "print_version_id" UUID NOT NULL,
    "event_type" "delivery_note_print_event_type" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,

    CONSTRAINT "delivery_note_print_events_pkey" PRIMARY KEY ("id")
);

-- Delivery-note summary integrity. VOIDED documents may have no first-print
-- summary or a complete historical summary, but never a partial summary.
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_print_summary_check"
  CHECK (
    "reprint_count" >= 0
    AND (
      (
        "status" = 'ACTIVE'
        AND "actual_delivery_date" IS NULL
        AND "first_printed_at" IS NULL
        AND "first_printed_by" IS NULL
        AND "reprint_count" = 0
      )
      OR
      (
        "status" IN ('SHIPPED', 'RECEIVABLE_CREATED')
        AND "actual_delivery_date" IS NOT NULL
        AND "first_printed_at" IS NOT NULL
        AND "first_printed_by" IS NOT NULL
      )
      OR
      (
        "status" = 'VOIDED'
        AND (
          (
            "actual_delivery_date" IS NULL
            AND "first_printed_at" IS NULL
            AND "first_printed_by" IS NULL
          )
          OR
          (
            "actual_delivery_date" IS NOT NULL
            AND "first_printed_at" IS NOT NULL
            AND "first_printed_by" IS NOT NULL
          )
        )
      )
    )
  ) NOT VALID;

ALTER TABLE "delivery_notes"
  VALIDATE CONSTRAINT "delivery_notes_print_summary_check";

-- CreateIndex
CREATE UNIQUE INDEX "delivery_note_print_versions_delivery_note_key"
  ON "delivery_note_print_versions"("delivery_note_id");

CREATE UNIQUE INDEX "delivery_note_print_versions_note_document_version_key"
  ON "delivery_note_print_versions"("delivery_note_id", "document_version");

-- Supporting unique for the event-to-version company-scoped composite FK.
CREATE UNIQUE INDEX "delivery_note_print_versions_id_note_company_key"
  ON "delivery_note_print_versions"("id", "delivery_note_id", "company_id");

CREATE INDEX "delivery_note_print_versions_company_generated_idx"
  ON "delivery_note_print_versions"("company_id", "generated_at" DESC);

CREATE INDEX "delivery_note_print_versions_generated_by_idx"
  ON "delivery_note_print_versions"("generated_by");

-- One delivery note has exactly one first formal-print event at most.
CREATE UNIQUE INDEX "delivery_note_print_events_one_formal_print_key"
  ON "delivery_note_print_events"("delivery_note_id")
  WHERE "event_type" = 'FORMAL_PRINT';

CREATE INDEX "delivery_note_print_events_note_occurred_idx"
  ON "delivery_note_print_events"("delivery_note_id", "occurred_at" DESC, "id");

CREATE INDEX "delivery_note_print_events_company_occurred_idx"
  ON "delivery_note_print_events"("company_id", "occurred_at" DESC);

CREATE INDEX "delivery_note_print_events_print_version_idx"
  ON "delivery_note_print_events"("print_version_id");

CREATE INDEX "delivery_note_print_events_actor_idx"
  ON "delivery_note_print_events"("actor_user_id");

CREATE INDEX "delivery_note_print_events_session_idx"
  ON "delivery_note_print_events"("session_id");

-- AddForeignKey
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_first_printed_by_fkey"
  FOREIGN KEY ("first_printed_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_versions"
  ADD CONSTRAINT "delivery_note_print_versions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_versions"
  ADD CONSTRAINT "delivery_note_print_versions_delivery_note_company_fkey"
  FOREIGN KEY ("delivery_note_id", "company_id")
  REFERENCES "delivery_notes"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_versions"
  ADD CONSTRAINT "delivery_note_print_versions_generated_by_fkey"
  FOREIGN KEY ("generated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_events"
  ADD CONSTRAINT "delivery_note_print_events_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_events"
  ADD CONSTRAINT "delivery_note_print_events_delivery_note_company_fkey"
  FOREIGN KEY ("delivery_note_id", "company_id")
  REFERENCES "delivery_notes"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_events"
  ADD CONSTRAINT "delivery_note_print_events_version_note_company_fkey"
  FOREIGN KEY ("print_version_id", "delivery_note_id", "company_id")
  REFERENCES "delivery_note_print_versions"("id", "delivery_note_id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_events"
  ADD CONSTRAINT "delivery_note_print_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "delivery_note_print_events"
  ADD CONSTRAINT "delivery_note_print_events_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Immutable print storage. ENABLE ALWAYS keeps the guard active even if a
-- session changes replication role; dropping a disposable database is unaffected.
CREATE FUNCTION "reject_delivery_note_print_storage_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "delivery_note_print_versions_reject_update_delete"
BEFORE UPDATE OR DELETE ON "delivery_note_print_versions"
FOR EACH ROW
EXECUTE FUNCTION "reject_delivery_note_print_storage_mutation"();

CREATE TRIGGER "delivery_note_print_versions_reject_truncate"
BEFORE TRUNCATE ON "delivery_note_print_versions"
FOR EACH STATEMENT
EXECUTE FUNCTION "reject_delivery_note_print_storage_mutation"();

CREATE TRIGGER "delivery_note_print_events_reject_update_delete"
BEFORE UPDATE OR DELETE ON "delivery_note_print_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_delivery_note_print_storage_mutation"();

CREATE TRIGGER "delivery_note_print_events_reject_truncate"
BEFORE TRUNCATE ON "delivery_note_print_events"
FOR EACH STATEMENT
EXECUTE FUNCTION "reject_delivery_note_print_storage_mutation"();

ALTER TABLE "delivery_note_print_versions"
  ENABLE ALWAYS TRIGGER "delivery_note_print_versions_reject_update_delete";
ALTER TABLE "delivery_note_print_versions"
  ENABLE ALWAYS TRIGGER "delivery_note_print_versions_reject_truncate";
ALTER TABLE "delivery_note_print_events"
  ENABLE ALWAYS TRIGGER "delivery_note_print_events_reject_update_delete";
ALTER TABLE "delivery_note_print_events"
  ENABLE ALWAYS TRIGGER "delivery_note_print_events_reject_truncate";

COMMIT;
