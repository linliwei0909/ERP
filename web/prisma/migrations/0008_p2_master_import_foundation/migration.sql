-- CreateEnum
CREATE TYPE "migration_batch_status" AS ENUM ('PENDING', 'VALIDATING', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "migration_issue_severity" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "migration_resolution_status" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "migration_reconciliation_status" AS ENUM ('MATCHED', 'MISMATCHED');

-- CreateTable
CREATE TABLE "migration_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "source_system" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "source_file_name" VARCHAR(255) NOT NULL,
    "source_file_hash" CHAR(64) NOT NULL,
    "status" "migration_batch_status" NOT NULL DEFAULT 'PENDING',
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "initiated_by" UUID NOT NULL,
    "correlation_id" VARCHAR(100) NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "summary_json" JSONB,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "migration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_id_map" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_system" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "legacy_id" VARCHAR(255) NOT NULL,
    "local_id" UUID NOT NULL,
    "migration_batch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_id_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "migration_batch_id" UUID NOT NULL,
    "row_number" INTEGER,
    "legacy_id" VARCHAR(255),
    "severity" "migration_issue_severity" NOT NULL,
    "issue_code" VARCHAR(100) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "source_data_json" JSONB,
    "resolution_status" "migration_resolution_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_reconciliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "migration_batch_id" UUID NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "source_count" INTEGER NOT NULL,
    "imported_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL,
    "failed_count" INTEGER NOT NULL,
    "reconciliation_status" "migration_reconciliation_status" NOT NULL,
    "details_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_batches_company_status_started_idx" ON "migration_batches"("company_id", "status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "migration_batches_initiator_started_idx" ON "migration_batches"("initiated_by", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "migration_batches_company_source_entity_hash_dry_key" ON "migration_batches"("company_id", "source_system", "entity_type", "source_file_hash", "dry_run");

-- CreateIndex
CREATE INDEX "legacy_id_map_entity_local_idx" ON "legacy_id_map"("entity_type", "local_id");

-- CreateIndex
CREATE INDEX "legacy_id_map_batch_idx" ON "legacy_id_map"("migration_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_id_map_source_entity_legacy_key" ON "legacy_id_map"("source_system", "entity_type", "legacy_id");

-- CreateIndex
CREATE INDEX "migration_issues_batch_severity_resolution_idx" ON "migration_issues"("migration_batch_id", "severity", "resolution_status");

-- CreateIndex
CREATE INDEX "migration_issues_resolution_created_idx" ON "migration_issues"("resolution_status", "created_at");

-- CreateIndex
CREATE INDEX "migration_reconciliations_status_created_idx" ON "migration_reconciliations"("reconciliation_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "migration_reconciliations_batch_entity_key" ON "migration_reconciliations"("migration_batch_id", "entity_type");

-- Custom import lifecycle, count and data-quality constraints.
ALTER TABLE "migration_batches"
ADD CONSTRAINT "migration_batches_required_text_check"
CHECK (
    btrim("source_system") <> ''
    AND btrim("entity_type") <> ''
    AND btrim("source_file_name") <> ''
    AND "source_file_hash" ~ '^[0-9a-f]{64}$'
    AND btrim("correlation_id") <> ''
),
ADD CONSTRAINT "migration_batches_counts_check"
CHECK (
    "total_count" >= 0
    AND "valid_count" >= 0
    AND "imported_count" >= 0
    AND "skipped_count" >= 0
    AND "failed_count" >= 0
    AND "valid_count" <= "total_count"
    AND "imported_count" + "skipped_count" + "failed_count" <= "total_count"
),
ADD CONSTRAINT "migration_batches_completion_check"
CHECK (
    ("status" IN ('PENDING', 'VALIDATING', 'IMPORTING') AND "completed_at" IS NULL)
    OR ("status" IN ('VALIDATED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED') AND "completed_at" IS NOT NULL)
);

ALTER TABLE "legacy_id_map"
ADD CONSTRAINT "legacy_id_map_required_text_check"
CHECK (
    btrim("source_system") <> ''
    AND btrim("entity_type") <> ''
    AND btrim("legacy_id") <> ''
);

ALTER TABLE "migration_issues"
ADD CONSTRAINT "migration_issues_row_number_check"
CHECK ("row_number" IS NULL OR "row_number" > 0),
ADD CONSTRAINT "migration_issues_required_text_check"
CHECK (btrim("issue_code") <> '' AND btrim("message") <> ''),
ADD CONSTRAINT "migration_issues_resolution_check"
CHECK (
    ("resolution_status" = 'OPEN' AND "resolved_by" IS NULL AND "resolved_at" IS NULL)
    OR (
        "resolution_status" IN ('RESOLVED', 'IGNORED')
        AND "resolved_by" IS NOT NULL
        AND "resolved_at" IS NOT NULL
    )
);

ALTER TABLE "migration_reconciliations"
ADD CONSTRAINT "migration_reconciliations_counts_check"
CHECK (
    "source_count" >= 0
    AND "imported_count" >= 0
    AND "skipped_count" >= 0
    AND "failed_count" >= 0
    AND "imported_count" + "skipped_count" + "failed_count" <= "source_count"
),
ADD CONSTRAINT "migration_reconciliations_status_check"
CHECK (
    "reconciliation_status" <> 'MATCHED'
    OR "imported_count" + "skipped_count" + "failed_count" = "source_count"
);

-- AddForeignKey
ALTER TABLE "migration_batches" ADD CONSTRAINT "migration_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "migration_batches" ADD CONSTRAINT "migration_batches_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_id_map" ADD CONSTRAINT "legacy_id_map_migration_batch_id_fkey" FOREIGN KEY ("migration_batch_id") REFERENCES "migration_batches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "migration_issues" ADD CONSTRAINT "migration_issues_migration_batch_id_fkey" FOREIGN KEY ("migration_batch_id") REFERENCES "migration_batches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "migration_issues" ADD CONSTRAINT "migration_issues_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "migration_reconciliations" ADD CONSTRAINT "migration_reconciliations_migration_batch_id_fkey" FOREIGN KEY ("migration_batch_id") REFERENCES "migration_batches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
