-- Preserve existing P1.2 audit and idempotency data while adopting the
-- reviewed P1.3 field names.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
      AND column_name = 'action'
  ) THEN
    ALTER TABLE "audit_logs" RENAME COLUMN "action" TO "operation";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
      AND column_name = 'before_value'
  ) THEN
    ALTER TABLE "audit_logs" RENAME COLUMN "before_value" TO "before_json";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
      AND column_name = 'after_value'
  ) THEN
    ALTER TABLE "audit_logs" RENAME COLUMN "after_value" TO "after_json";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'idempotency_keys'
      AND column_name = 'response_body'
  ) THEN
    ALTER TABLE "idempotency_keys"
      RENAME COLUMN "response_body" TO "response_metadata";
  END IF;
END
$$;

-- Audit context is complete for every new record. Legacy P1.2 rows receive a
-- deterministic migration request id instead of being discarded.
ALTER TABLE "audit_logs"
ADD COLUMN IF NOT EXISTS "session_id" UUID;

-- The database append-only boundary remains active for normal application
-- traffic. It is paused only for this reviewed legacy backfill and restored
-- before the migration commits.
ALTER TABLE "audit_logs"
DISABLE TRIGGER "audit_logs_prevent_update_delete";
UPDATE "audit_logs"
SET "request_id" = 'migration-' || "id"::text
WHERE "request_id" IS NULL;
ALTER TABLE "audit_logs"
ENABLE TRIGGER "audit_logs_prevent_update_delete";

ALTER TABLE "audit_logs"
ALTER COLUMN "request_id" SET NOT NULL;

-- Idempotency lifecycle metadata.
ALTER TABLE "idempotency_keys"
ADD COLUMN "completed_at" TIMESTAMPTZ(3),
ADD COLUMN "failed_at" TIMESTAMPTZ(3),
ADD COLUMN "result_reference" VARCHAR(255),
ADD COLUMN "started_at" TIMESTAMPTZ(3);

UPDATE "idempotency_keys"
SET "started_at" = "created_at"
WHERE "started_at" IS NULL;

ALTER TABLE "idempotency_keys"
ALTER COLUMN "started_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "started_at" SET NOT NULL;

-- Background job retry, observability, and terminal-state metadata.
ALTER TABLE "background_jobs"
ADD COLUMN "completed_at" TIMESTAMPTZ(3),
ADD COLUMN "correlation_id" VARCHAR(100),
ADD COLUMN "dead_lettered_at" TIMESTAMPTZ(3),
ADD COLUMN "failed_at" TIMESTAMPTZ(3),
ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 5;

-- Worker liveness is separate from job records so readiness can detect a
-- worker that is alive even when the queue is empty.
CREATE TABLE "worker_heartbeats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "worker_id" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "last_heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_heartbeats_worker_id_key"
ON "worker_heartbeats"("worker_id");

CREATE INDEX "worker_heartbeats_status_last_idx"
ON "worker_heartbeats"("status", "last_heartbeat_at");

CREATE INDEX "audit_logs_session_occurred_idx"
ON "audit_logs"("session_id", "occurred_at" DESC);

CREATE INDEX "audit_logs_request_occurred_idx"
ON "audit_logs"("request_id", "occurred_at" DESC);

CREATE INDEX "background_jobs_status_locked_idx"
ON "background_jobs"("status", "locked_at");

CREATE INDEX "idempotency_keys_status_started_idx"
ON "idempotency_keys"("status", "started_at");

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lifecycle constraints are intentionally custom SQL because Prisma cannot
-- express these PostgreSQL checks.
ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_request_id_check"
CHECK (NULLIF(BTRIM("request_id"), '') IS NOT NULL);

ALTER TABLE "idempotency_keys"
ADD CONSTRAINT "idempotency_keys_lifecycle_check"
CHECK (
  (
    "status" = 'PROCESSING'
    AND "completed_at" IS NULL
    AND "failed_at" IS NULL
  )
  OR
  (
    "status" = 'COMPLETED'
    AND "completed_at" IS NOT NULL
    AND "failed_at" IS NULL
  )
  OR
  (
    "status" = 'FAILED'
    AND "completed_at" IS NULL
    AND "failed_at" IS NOT NULL
  )
);

ALTER TABLE "background_jobs"
ADD CONSTRAINT "background_jobs_max_attempts_check"
CHECK ("max_attempts" > 0 AND "attempt_count" <= "max_attempts");

ALTER TABLE "background_jobs"
ADD CONSTRAINT "background_jobs_lock_pair_check"
CHECK (
  ("locked_at" IS NULL AND "locked_by" IS NULL)
  OR
  ("locked_at" IS NOT NULL AND NULLIF(BTRIM("locked_by"), '') IS NOT NULL)
);

ALTER TABLE "worker_heartbeats"
ADD CONSTRAINT "worker_heartbeats_status_check"
CHECK ("status" IN ('STARTING', 'RUNNING', 'STOPPING', 'STOPPED'));

-- A failed job remains the active deduplicated record while it is waiting for
-- its scheduled retry.
DROP INDEX "background_jobs_active_deduplication_key";

CREATE UNIQUE INDEX "background_jobs_active_deduplication_key"
ON "background_jobs" ("job_type", "deduplication_key")
WHERE
  "deduplication_key" IS NOT NULL
  AND "status" IN ('PENDING', 'PROCESSING', 'FAILED');

COMMIT;
