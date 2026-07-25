import { createHash } from "node:crypto";
import {
  Prisma,
  type IdempotencyKey,
  type PrismaClient,
} from "@/generated/prisma/client";
import { sanitizeSensitive } from "@/lib/sensitive-data";

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_KEY_CONFLICT";

  constructor() {
    super("相同冪等鍵不可搭配不同的請求內容");
  }
}

export class IdempotencyInProgressError extends Error {
  readonly code = "IDEMPOTENCY_IN_PROGRESS";

  constructor() {
    super("相同操作仍在處理中");
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function hashIdempotencyPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

export type IdempotencyInput = {
  companyId: string;
  userId?: string | null;
  operation: string;
  key: string;
  payload: unknown;
  expiresAt: Date;
  now?: Date;
};

type ClaimResult =
  | { kind: "started"; record: IdempotencyKey }
  | {
      kind: "replay";
      responseStatus: number | null;
      responseMetadata: unknown;
      resultReference: string | null;
    };

async function claim(
  db: PrismaClient,
  input: IdempotencyInput,
): Promise<ClaimResult> {
  const now = input.now ?? new Date();
  const requestHash = hashIdempotencyPayload(input.payload);

  return db.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "idempotency_keys" (
        "company_id", "user_id", "operation", "idempotency_key",
        "request_hash", "status", "expires_at", "started_at",
        "created_at", "updated_at"
      )
      VALUES (
        ${input.companyId}::uuid, ${input.userId ?? null}::uuid,
        ${input.operation}, ${input.key}, ${requestHash}, 'PROCESSING',
        ${input.expiresAt}, ${now}, ${now}, ${now}
      )
      ON CONFLICT ("company_id", "operation", "idempotency_key")
      DO NOTHING
      RETURNING "id"
    `;

    if (inserted[0]) {
      return {
        kind: "started",
        record: await tx.idempotencyKey.findUniqueOrThrow({
          where: { id: inserted[0].id },
        }),
      };
    }

    const existingRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "idempotency_keys"
      WHERE "company_id" = ${input.companyId}::uuid
        AND "operation" = ${input.operation}
        AND "idempotency_key" = ${input.key}
      FOR UPDATE
    `;
    const existing = await tx.idempotencyKey.findUniqueOrThrow({
      where: { id: existingRows[0].id },
    });

    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError();
    }

    if (existing.status === "COMPLETED" && existing.expiresAt > now) {
      return {
        kind: "replay",
        responseStatus: existing.responseStatus,
        responseMetadata: existing.responseMetadata,
        resultReference: existing.resultReference,
      };
    }

    if (existing.status === "PROCESSING" && existing.expiresAt > now) {
      throw new IdempotencyInProgressError();
    }

    const restarted = await tx.idempotencyKey.update({
      where: { id: existing.id },
      data: {
        userId: input.userId,
        requestHash,
        status: "PROCESSING",
        responseStatus: null,
        responseMetadata: Prisma.DbNull,
        resultReference: null,
        expiresAt: input.expiresAt,
        startedAt: now,
        completedAt: null,
        failedAt: null,
      },
    });
    return { kind: "started", record: restarted };
  });
}

export type IdempotentResult<T> =
  | { replayed: false; value: T }
  | {
      replayed: true;
      responseStatus: number | null;
      responseMetadata: unknown;
      resultReference: string | null;
    };

export async function executeIdempotent<T>(
  db: PrismaClient,
  input: IdempotencyInput,
  handler: (
    tx: Prisma.TransactionClient,
  ) => Promise<{
    value: T;
    responseStatus: number;
    responseMetadata?: unknown;
    resultReference?: string;
  }>,
): Promise<IdempotentResult<T>> {
  const claimed = await claim(db, input);
  if (claimed.kind === "replay") {
    return { replayed: true, ...claimed };
  }

  try {
    const value = await db.$transaction(async (tx) => {
      const result = await handler(tx);
      await tx.idempotencyKey.update({
        where: { id: claimed.record.id },
        data: {
          status: "COMPLETED",
          responseStatus: result.responseStatus,
          responseMetadata: sanitizeSensitive(
            result.responseMetadata ?? {},
          ) as Prisma.InputJsonValue,
          resultReference: result.resultReference,
          completedAt: new Date(),
          failedAt: null,
        },
      });
      return result.value;
    });
    return { replayed: false, value };
  } catch (error) {
    await db.idempotencyKey.updateMany({
      where: { id: claimed.record.id, status: "PROCESSING" },
      data: {
        status: "FAILED",
        completedAt: null,
        failedAt: new Date(),
      },
    });
    throw error;
  }
}
