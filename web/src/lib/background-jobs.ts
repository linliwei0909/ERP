import type {
  BackgroundJob,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { createRequestId } from "@/lib/correlation";
import { sanitizeSensitive, sanitizeText } from "@/lib/sensitive-data";

export type EnqueueJobInput = {
  companyId?: string | null;
  jobType: string;
  payload: unknown;
  availableAt?: Date;
  maxAttempts?: number;
  deduplicationKey?: string | null;
  correlationId?: string;
};

export async function enqueueJob(
  db: PrismaClient | Prisma.TransactionClient,
  input: EnqueueJobInput,
): Promise<{ job: BackgroundJob; deduplicated: boolean }> {
  const payload = sanitizeSensitive(input.payload) as Prisma.InputJsonValue;
  const correlationId = createRequestId(input.correlationId);
  const availableAt = input.availableAt ?? new Date();
  const maxAttempts = input.maxAttempts ?? 5;

  if (!input.deduplicationKey) {
    return {
      deduplicated: false,
      job: await db.backgroundJob.create({
        data: {
          companyId: input.companyId,
          jobType: input.jobType,
          payload,
          availableAt,
          maxAttempts,
          correlationId,
        },
      }),
    };
  }

  const inserted = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "background_jobs" (
      "company_id", "job_type", "payload", "status", "available_at",
      "attempt_count", "max_attempts", "deduplication_key",
      "correlation_id", "created_at", "updated_at"
    )
    VALUES (
      ${input.companyId ?? null}::uuid, ${input.jobType},
      ${JSON.stringify(payload)}::jsonb, 'PENDING', ${availableAt},
      0, ${maxAttempts}, ${input.deduplicationKey},
      ${correlationId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("job_type", "deduplication_key")
      WHERE "deduplication_key" IS NOT NULL
        AND "status" IN ('PENDING', 'PROCESSING', 'FAILED')
    DO NOTHING
    RETURNING "id"
  `;

  if (inserted[0]) {
    return {
      deduplicated: false,
      job: await db.backgroundJob.findUniqueOrThrow({
        where: { id: inserted[0].id },
      }),
    };
  }

  return {
    deduplicated: true,
    job: await db.backgroundJob.findFirstOrThrow({
      where: {
        jobType: input.jobType,
        deduplicationKey: input.deduplicationKey,
        status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    }),
  };
}

export async function claimNextJob(
  db: PrismaClient,
  input: {
    workerId: string;
    staleBefore: Date;
    now?: Date;
    companyId?: string;
  },
): Promise<BackgroundJob | null> {
  const now = input.now ?? new Date();
  const correlationId = createRequestId();

  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      WITH candidate AS (
        SELECT "id"
        FROM "background_jobs"
        WHERE "attempt_count" < "max_attempts"
          AND (
            ${input.companyId ?? null}::uuid IS NULL
            OR "company_id" = ${input.companyId ?? null}::uuid
          )
          AND (
            (
              "status" IN ('PENDING', 'FAILED')
              AND "available_at" <= ${now}
            )
            OR
            (
              "status" = 'PROCESSING'
              AND "locked_at" < ${input.staleBefore}
            )
          )
        ORDER BY "available_at", "created_at"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "background_jobs" AS job
      SET
        "status" = 'PROCESSING',
        "attempt_count" = job."attempt_count" + 1,
        "locked_at" = ${now},
        "locked_by" = ${input.workerId},
        "correlation_id" = ${correlationId},
        "failed_at" = NULL,
        "last_error" = NULL,
        "updated_at" = ${now}
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id"
    `;

    return rows[0]
      ? tx.backgroundJob.findUniqueOrThrow({ where: { id: rows[0].id } })
      : null;
  });
}

export async function heartbeatJobLock(
  db: PrismaClient,
  jobId: string,
  workerId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await db.backgroundJob.updateMany({
    where: { id: jobId, status: "PROCESSING", lockedBy: workerId },
    data: { lockedAt: now },
  });
  return result.count === 1;
}

export async function completeJob(
  db: PrismaClient,
  jobId: string,
  workerId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await db.backgroundJob.updateMany({
    where: { id: jobId, status: "PROCESSING", lockedBy: workerId },
    data: {
      status: "COMPLETED",
      lockedAt: null,
      lockedBy: null,
      completedAt: now,
      failedAt: null,
      deadLetteredAt: null,
    },
  });
  return result.count === 1;
}

export function retryDelayMs(
  attemptCount: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attemptCount - 1));
}

export async function failJob(
  db: PrismaClient,
  input: {
    jobId: string;
    workerId: string;
    error: unknown;
    baseDelayMs: number;
    maxDelayMs: number;
    now?: Date;
  },
): Promise<"FAILED" | "DEAD_LETTER" | "NOT_OWNED"> {
  const now = input.now ?? new Date();
  const job = await db.backgroundJob.findFirst({
    where: {
      id: input.jobId,
      status: "PROCESSING",
      lockedBy: input.workerId,
    },
  });
  if (!job) {
    return "NOT_OWNED";
  }

  const message = sanitizeText(
    input.error instanceof Error ? input.error.message : String(input.error),
  ).slice(0, 4000);
  const deadLetter = job.attemptCount >= job.maxAttempts;

  await db.backgroundJob.update({
    where: { id: job.id },
    data: deadLetter
      ? {
          status: "DEAD_LETTER",
          lockedAt: null,
          lockedBy: null,
          lastError: message,
          failedAt: now,
          deadLetteredAt: now,
        }
      : {
          status: "FAILED",
          availableAt: new Date(
            now.getTime() +
              retryDelayMs(
                job.attemptCount,
                input.baseDelayMs,
                input.maxDelayMs,
              ),
          ),
          lockedAt: null,
          lockedBy: null,
          lastError: message,
          failedAt: now,
          deadLetteredAt: null,
        },
  });
  return deadLetter ? "DEAD_LETTER" : "FAILED";
}

export async function updateWorkerHeartbeat(
  db: PrismaClient,
  input: {
    workerId: string;
    status: "STARTING" | "RUNNING" | "STOPPING" | "STOPPED";
    startedAt: Date;
    now?: Date;
    metadata?: unknown;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await db.workerHeartbeat.upsert({
    where: { workerId: input.workerId },
    create: {
      workerId: input.workerId,
      status: input.status,
      startedAt: input.startedAt,
      lastHeartbeatAt: now,
      metadata: sanitizeSensitive(
        input.metadata ?? {},
      ) as Prisma.InputJsonValue,
    },
    update: {
      status: input.status,
      lastHeartbeatAt: now,
      metadata: sanitizeSensitive(
        input.metadata ?? {},
      ) as Prisma.InputJsonValue,
    },
  });
}
