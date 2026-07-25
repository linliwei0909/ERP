import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("formal schema baseline", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("contains only the approved P1 and P2.2 tables", async () => {
    const result = await client.query<{ tablename: string }>(
      `SELECT tablename
         FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename`,
    );

    expect(result.rows.map((row) => row.tablename)).toEqual([
      "_prisma_migrations",
      "audit_logs",
      "background_jobs",
      "companies",
      "company_settings",
      "customer_companies",
      "customer_contacts",
      "customers",
      "delivery_locations",
      "document_sequences",
      "idempotency_keys",
      "roles",
      "user_company_scopes",
      "user_roles",
      "user_sessions",
      "users",
      "worker_heartbeats",
    ]);
  });

  it("executes only the formal migration chain through P2.2", async () => {
    const result = await client.query<{ migration_name: string }>(
      `SELECT migration_name
         FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        ORDER BY started_at`,
    );

    expect(result.rows.map((row) => row.migration_name)).toEqual([
      "0001_p1_foundation_baseline",
      "0002_p1_authentication_and_access",
      "0003_p1_operational_foundation",
      "0004_p2_customer_master",
    ]);
  });

  it("installs the UUID extension", async () => {
    const result = await client.query<{ extname: string }>(
      `SELECT extname
         FROM pg_catalog.pg_extension
        WHERE extname = 'pgcrypto'`,
    );

    expect(result.rows).toEqual([{ extname: "pgcrypto" }]);
  });

  it("uses a PostgreSQL-generated UUID", async () => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO companies (code, name, updated_at)
       VALUES ($1, $2, now())
       RETURNING id`,
      [`T-${randomUUID().slice(0, 24)}`, "UUID baseline test"],
    );

    expect(result.rows[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("has the required custom constraints and indexes", async () => {
    const result = await client.query<{ object_name: string }>(
      `SELECT conname AS object_name
         FROM pg_catalog.pg_constraint
        WHERE conname IN (
          'user_sessions_idle_window_check',
          'user_sessions_revocation_reason_check',
          'document_sequences_fiscal_year_check',
          'document_sequences_last_value_check',
          'idempotency_keys_expiry_check',
          'background_jobs_attempt_count_check'
          ,'users_failed_login_attempts_check'
          ,'audit_logs_request_id_check'
          ,'idempotency_keys_lifecycle_check'
          ,'background_jobs_max_attempts_check'
          ,'background_jobs_lock_pair_check'
          ,'worker_heartbeats_status_check'
        )
       UNION ALL
       SELECT indexname AS object_name
         FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'user_sessions_active_idx',
            'background_jobs_active_deduplication_key'
          )
       ORDER BY object_name`,
    );

    expect(result.rows.map((row) => row.object_name)).toEqual([
      "audit_logs_request_id_check",
      "background_jobs_active_deduplication_key",
      "background_jobs_attempt_count_check",
      "background_jobs_lock_pair_check",
      "background_jobs_max_attempts_check",
      "document_sequences_fiscal_year_check",
      "document_sequences_last_value_check",
      "idempotency_keys_expiry_check",
      "idempotency_keys_lifecycle_check",
      "user_sessions_active_idx",
      "user_sessions_idle_window_check",
      "user_sessions_revocation_reason_check",
      "users_failed_login_attempts_check",
      "worker_heartbeats_status_check",
    ]);
  });

  it("has the required foreign keys and unique indexes", async () => {
    const foreignKeys = await client.query<{ constraint_name: string }>(
      `SELECT conname AS constraint_name
         FROM pg_catalog.pg_constraint
        WHERE contype = 'f'
          AND conname IN (
            'company_settings_company_id_fkey',
            'user_sessions_user_id_fkey',
            'idempotency_keys_company_id_fkey',
            'background_jobs_company_id_fkey',
            'audit_logs_actor_user_id_fkey'
            ,'audit_logs_session_id_fkey'
          )
        ORDER BY conname`,
    );
    const uniqueIndexes = await client.query<{ index_name: string }>(
      `SELECT indexname AS index_name
         FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'user_sessions_token_hash_key',
            'user_roles_user_role_key',
            'user_company_scopes_user_company_key',
            'idempotency_keys_company_operation_key'
          )
        ORDER BY indexname`,
    );

    expect(foreignKeys.rows.map((row) => row.constraint_name)).toEqual([
      "audit_logs_actor_user_id_fkey",
      "audit_logs_session_id_fkey",
      "background_jobs_company_id_fkey",
      "company_settings_company_id_fkey",
      "idempotency_keys_company_id_fkey",
      "user_sessions_user_id_fkey",
    ]);
    expect(uniqueIndexes.rows.map((row) => row.index_name)).toEqual([
      "idempotency_keys_company_operation_key",
      "user_company_scopes_user_company_key",
      "user_roles_user_role_key",
      "user_sessions_token_hash_key",
    ]);
  });

  it("enforces company-operation-key idempotency", async () => {
    const company = await client.query<{ id: string }>(
      `INSERT INTO companies (code, name, updated_at)
       VALUES ($1, $2, now())
       RETURNING id`,
      [`I-${randomUUID().slice(0, 24)}`, "Idempotency test"],
    );
    const companyId = company.rows[0]!.id;
    const key = randomUUID();

    await client.query(
      `INSERT INTO idempotency_keys (
         company_id, operation, idempotency_key, request_hash, expires_at, updated_at
       ) VALUES ($1, 'test.operation', $2, 'request-hash', now() + interval '1 hour', now())`,
      [companyId, key],
    );

    await expect(
      client.query(
        `INSERT INTO idempotency_keys (
           company_id, operation, idempotency_key, request_hash, expires_at, updated_at
         ) VALUES ($1, 'test.operation', $2, 'request-hash', now() + interval '1 hour', now())`,
        [companyId, key],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces active background-job deduplication", async () => {
    const deduplicationKey = randomUUID();
    const first = await client.query<{ id: string }>(
      `INSERT INTO background_jobs (
         job_type, payload, deduplication_key, updated_at
       ) VALUES ('test.job', '{}'::jsonb, $1, now())
       RETURNING id`,
      [deduplicationKey],
    );

    await expect(
      client.query(
        `INSERT INTO background_jobs (
           job_type, payload, deduplication_key, updated_at
         ) VALUES ('test.job', '{}'::jsonb, $1, now())`,
        [deduplicationKey],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    await client.query(
      `UPDATE background_jobs
          SET status = 'COMPLETED'
        WHERE id = $1`,
      [first.rows[0]!.id],
    );

    await expect(
      client.query(
        `INSERT INTO background_jobs (
           job_type, payload, deduplication_key, updated_at
         ) VALUES ('test.job', '{}'::jsonb, $1, now())`,
        [deduplicationKey],
      ),
    ).resolves.toBeDefined();
  });

  it("prevents audit log updates and deletes", async () => {
    const audit = await client.query<{ id: string }>(
      `INSERT INTO audit_logs (entity_type, entity_id, operation, request_id)
       VALUES ('baseline_test', $1, 'created', $2)
       RETURNING id`,
      [randomUUID(), randomUUID()],
    );
    const auditId = audit.rows[0]!.id;

    await expect(
      client.query(`UPDATE audit_logs SET operation = 'changed' WHERE id = $1`, [
        auditId,
      ]),
    ).rejects.toThrow("audit_logs is append-only");

    await expect(
      client.query(`DELETE FROM audit_logs WHERE id = $1`, [auditId]),
    ).rejects.toThrow("audit_logs is append-only");
  });
});
