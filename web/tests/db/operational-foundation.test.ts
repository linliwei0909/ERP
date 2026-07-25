import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { systemAuditContext, writeAudit } from "../../src/lib/audit";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  updateWorkerHeartbeat,
} from "../../src/lib/background-jobs";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "../../src/lib/idempotency";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P1.3 operational foundation workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  let companyId: string;
  const correlationId = "p1-3-correlation-test";

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    companyId = (
      await db.company.create({
        data: { code: `OPS-${suffix}`, name: `營運測試 ${suffix}` },
      })
    ).id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("writes a sanitized audit in the caller transaction", async () => {
    const entityId = randomUUID();
    await db.$transaction(async (tx) => {
      await writeAudit(tx, {
        ...systemAuditContext({
          companyId,
          requestId: correlationId,
        }),
        entityType: "operational_test",
        entityId,
        operation: "operational.created",
        beforeJson: { safe: "old" },
        afterJson: { safe: "value", password: "must-not-persist" },
      });
    });

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId, operation: "operational.created" },
    });
    expect(audit.requestId).toBe(correlationId);
    expect(audit.beforeJson).toEqual({ safe: "old" });
    expect(audit.afterJson).toEqual({
      safe: "value",
      password: "[REDACTED]",
    });
    expect(JSON.stringify(audit)).not.toContain("must-not-persist");
  });

  it("rolls back audit together with a failed transaction", async () => {
    const entityId = randomUUID();
    await expect(
      db.$transaction(async (tx) => {
        await writeAudit(tx, {
          ...systemAuditContext({ companyId }),
          entityType: "operational_test",
          entityId,
          operation: "must.rollback",
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await db.auditLog.count({ where: { entityId } })).toBe(0);
  });

  it("replays completed idempotent operations and rejects payload changes", async () => {
    const key = randomUUID();
    let calls = 0;
    const execute = (payload: unknown) =>
      executeIdempotent(
        db,
        {
          companyId,
          operation: "test.idempotent",
          key,
          payload,
          expiresAt: new Date(Date.now() + 60_000),
        },
        async () => {
          calls += 1;
          return {
            value: "created",
            responseStatus: 201,
            responseMetadata: { password: "redact-me", safe: true },
            resultReference: "result-1",
          };
        },
      );

    expect(await execute({ value: 1 })).toEqual({
      replayed: false,
      value: "created",
    });
    const replay = await execute({ value: 1 });
    expect(replay).toMatchObject({
      replayed: true,
      responseStatus: 201,
      resultReference: "result-1",
    });
    expect(JSON.stringify(replay)).not.toContain("redact-me");
    expect(calls).toBe(1);
    await expect(execute({ value: 2 })).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );

    await db.idempotencyKey.update({
      where: {
        companyId_operation_idempotencyKey: {
          companyId,
          operation: "test.idempotent",
          idempotencyKey: key,
        },
      },
      data: {
        createdAt: new Date(0),
        expiresAt: new Date(1),
      },
    });
    await expect(execute({ value: 1 })).resolves.toEqual({
      replayed: false,
      value: "created",
    });
    expect(calls).toBe(2);
  });

  it("rejects concurrent processing and permits retry after failure", async () => {
    const processingKey = randomUUID();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = executeIdempotent(
      db,
      {
        companyId,
        operation: "test.concurrent",
        key: processingKey,
        payload: { value: 1 },
        expiresAt: new Date(Date.now() + 60_000),
      },
      async () => {
        await gate;
        return { value: "ok", responseStatus: 200 };
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(
      executeIdempotent(
        db,
        {
          companyId,
          operation: "test.concurrent",
          key: processingKey,
          payload: { value: 1 },
          expiresAt: new Date(Date.now() + 60_000),
        },
        async () => ({ value: "duplicate", responseStatus: 200 }),
      ),
    ).rejects.toBeInstanceOf(IdempotencyInProgressError);
    release();
    await expect(first).resolves.toMatchObject({ replayed: false });

    const retryKey = randomUUID();
    const input = {
      companyId,
      operation: "test.retry",
      key: retryKey,
      payload: { value: 1 },
      expiresAt: new Date(Date.now() + 60_000),
    };
    await expect(
      executeIdempotent(db, input, async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: { name: "不得保留" },
        });
        throw new Error("expected failure");
      }),
    ).rejects.toThrow("expected failure");
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).name)
      .not.toBe("不得保留");
    await expect(
      executeIdempotent(db, input, async () => ({
        value: "retried",
        responseStatus: 200,
      })),
    ).resolves.toEqual({ replayed: false, value: "retried" });
  });

  it("deduplicates, atomically claims, completes, retries and dead-letters jobs", async () => {
    const deduplicationKey = randomUUID();
    const first = await enqueueJob(db, {
      companyId,
      jobType: "test.echo",
      payload: { token: "must-not-persist", safe: true },
      deduplicationKey,
      correlationId,
      maxAttempts: 2,
    });
    const duplicate = await enqueueJob(db, {
      companyId,
      jobType: "test.echo",
      payload: { safe: true },
      deduplicationKey,
    });
    expect(first.deduplicated).toBe(false);
    expect(duplicate).toMatchObject({
      deduplicated: true,
      job: { id: first.job.id },
    });
    expect(JSON.stringify(first.job.payload)).not.toContain("must-not-persist");
    expect(first.job.correlationId).toBe(correlationId);

    const claimInput = {
      workerId: "worker-test-a",
      staleBefore: new Date(Date.now() - 60_000),
      companyId,
    };
    const claims = await Promise.all([
      claimNextJob(db, claimInput),
      claimNextJob(db, claimInput),
    ]);
    expect(claims.filter((job) => job?.id === first.job.id)).toHaveLength(1);
    const claimed = claims.find((job) => job?.id === first.job.id)!;
    expect(await completeJob(db, claimed.id, "worker-test-a")).toBe(true);
    expect(await claimNextJob(db, claimInput)).toBeNull();

    const retry = await enqueueJob(db, {
      companyId,
      jobType: "test.echo",
      payload: {},
      maxAttempts: 2,
    });
    const retryClaim = await claimNextJob(db, {
      workerId: "worker-test-b",
      staleBefore: new Date(Date.now() - 60_000),
      companyId,
    });
    expect(retryClaim?.id).toBe(retry.job.id);
    expect(
      await failJob(db, {
        jobId: retry.job.id,
        workerId: "worker-test-b",
        error: new Error("token=do-not-store"),
        baseDelayMs: 0,
        maxDelayMs: 0,
      }),
    ).toBe("FAILED");
    await db.backgroundJob.update({
      where: { id: retry.job.id },
      data: { availableAt: new Date(0) },
    });
    const finalClaim = await claimNextJob(db, {
      workerId: "worker-test-b",
      staleBefore: new Date(Date.now() - 60_000),
      companyId,
    });
    expect(finalClaim?.id).toBe(retry.job.id);
    expect(
      await failJob(db, {
        jobId: retry.job.id,
        workerId: "worker-test-b",
        error: new Error("final"),
        baseDelayMs: 1,
        maxDelayMs: 1,
      }),
    ).toBe("DEAD_LETTER");
    const dead = await db.backgroundJob.findUniqueOrThrow({
      where: { id: retry.job.id },
    });
    expect(dead.status).toBe("DEAD_LETTER");
    expect(dead.lastError).not.toContain("do-not-store");
  });

  it("recovers stale locks and records worker heartbeat", async () => {
    const queued = await enqueueJob(db, {
      companyId,
      jobType: "test.echo",
      payload: {},
    });
    await db.backgroundJob.update({
      where: { id: queued.job.id },
      data: {
        status: "PROCESSING",
        attemptCount: 1,
        lockedAt: new Date(0),
        lockedBy: "stale-worker",
      },
    });
    const recovered = await claimNextJob(db, {
      workerId: "replacement-worker",
      staleBefore: new Date(Date.now() - 60_000),
      companyId,
    });
    expect(recovered).toMatchObject({
      id: queued.job.id,
      lockedBy: "replacement-worker",
      attemptCount: 2,
    });
    await completeJob(db, queued.job.id, "replacement-worker");

    const startedAt = new Date();
    await updateWorkerHeartbeat(db, {
      workerId: "worker-heartbeat-test",
      status: "RUNNING",
      startedAt,
      metadata: { password: "must-not-persist" },
    });
    const heartbeat = await db.workerHeartbeat.findUniqueOrThrow({
      where: { workerId: "worker-heartbeat-test" },
    });
    expect(heartbeat.status).toBe("RUNNING");
    expect(JSON.stringify(heartbeat.metadata)).not.toContain("must-not-persist");
  });
});
