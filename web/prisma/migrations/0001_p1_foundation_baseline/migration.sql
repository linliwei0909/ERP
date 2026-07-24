-- Required for PostgreSQL-generated UUID defaults.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "record_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "idempotency_status" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "background_job_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "setting_key" VARCHAR(100) NOT NULL,
    "setting_value" JSONB NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "normalized_username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "last_active_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_company_scopes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_company_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(255),
    "client_metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "document_type" VARCHAR(64) NOT NULL,
    "last_value" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "operation" VARCHAR(100) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(255) NOT NULL,
    "status" "idempotency_status" NOT NULL DEFAULT 'PROCESSING',
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "job_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "background_job_status" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(100),
    "deduplication_key" VARCHAR(255),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "actor_user_id" UUID,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "reason" TEXT,
    "before_value" JSONB,
    "after_value" JSONB,
    "metadata" JSONB,
    "request_id" VARCHAR(100),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE INDEX "companies_status_name_idx" ON "companies"("status", "name");

-- CreateIndex
CREATE INDEX "company_settings_lookup_idx" ON "company_settings"("company_id", "setting_key", "effective_from" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_company_key_effective_key" ON "company_settings"("company_id", "setting_key", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_username_key" ON "users"("normalized_username");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_status_idx" ON "roles"("status");

-- CreateIndex
CREATE INDEX "user_roles_role_user_idx" ON "user_roles"("role_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_role_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "user_company_scopes_company_user_idx" ON "user_company_scopes"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_company_scopes_user_company_key" ON "user_company_scopes"("user_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_revoked_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_idle_expires_idx" ON "user_sessions"("idle_expires_at");

-- CreateIndex
CREATE INDEX "document_sequences_type_year_idx" ON "document_sequences"("document_type", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_company_year_type_key" ON "document_sequences"("company_id", "fiscal_year", "document_type");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_user_created_idx" ON "idempotency_keys"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_company_operation_key" ON "idempotency_keys"("company_id", "operation", "idempotency_key");

-- CreateIndex
CREATE INDEX "background_jobs_status_available_idx" ON "background_jobs"("status", "available_at");

-- CreateIndex
CREATE INDEX "background_jobs_type_created_idx" ON "background_jobs"("job_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_occurred_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_occurred_idx" ON "audit_logs"("actor_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_company_occurred_idx" ON "audit_logs"("company_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_scopes" ADD CONSTRAINT "user_company_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_scopes" ADD CONSTRAINT "user_company_scopes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- P1 foundation checks that Prisma cannot express declaratively.
ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_idle_window_check"
CHECK ("idle_expires_at" > "last_activity_at");

ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_revocation_reason_check"
CHECK (
  ("revoked_at" IS NULL AND "revoked_reason" IS NULL)
  OR
  (
    "revoked_at" IS NOT NULL
    AND NULLIF(BTRIM("revoked_reason"), '') IS NOT NULL
  )
);

ALTER TABLE "document_sequences"
ADD CONSTRAINT "document_sequences_fiscal_year_check"
CHECK ("fiscal_year" BETWEEN 1 AND 9999);

ALTER TABLE "document_sequences"
ADD CONSTRAINT "document_sequences_last_value_check"
CHECK ("last_value" >= 0);

ALTER TABLE "idempotency_keys"
ADD CONSTRAINT "idempotency_keys_expiry_check"
CHECK ("expires_at" > "created_at");

ALTER TABLE "background_jobs"
ADD CONSTRAINT "background_jobs_attempt_count_check"
CHECK ("attempt_count" >= 0);

-- Partial indexes are managed by reviewed custom SQL.
CREATE INDEX "user_sessions_active_idx"
ON "user_sessions" ("user_id", "idle_expires_at")
WHERE "revoked_at" IS NULL;

CREATE UNIQUE INDEX "background_jobs_active_deduplication_key"
ON "background_jobs" ("job_type", "deduplication_key")
WHERE
  "deduplication_key" IS NOT NULL
  AND "status" IN ('PENDING', 'PROCESSING');

-- audit_logs is append-only at the database boundary.
CREATE FUNCTION "prevent_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

CREATE TRIGGER "audit_logs_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_mutation"();

CREATE TRIGGER "audit_logs_prevent_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_audit_log_mutation"();
