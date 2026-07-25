import type { Prisma } from "@/generated/prisma/client";
import { createRequestId } from "@/lib/correlation";
import { sanitizeSensitive } from "@/lib/sensitive-data";

type AuditDatabase = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditContext = {
  companyId?: string | null;
  actorUserId?: string | null;
  sessionId?: string | null;
  requestId: string;
};

export type AuditInput = AuditContext & {
  entityType: string;
  entityId: string;
  operation: string;
  reason?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadata?: unknown;
};

function auditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return sanitizeSensitive(value) as Prisma.InputJsonValue;
}

export function systemAuditContext(
  overrides: Partial<AuditContext> = {},
): AuditContext {
  return {
    companyId: overrides.companyId,
    actorUserId: overrides.actorUserId,
    sessionId: overrides.sessionId,
    requestId: createRequestId(overrides.requestId),
  };
}

export async function writeAudit(
  tx: AuditDatabase,
  input: AuditInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      sessionId: input.sessionId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      reason: input.reason,
      beforeJson: auditJson(input.beforeJson),
      afterJson: auditJson(input.afterJson),
      metadata: auditJson(input.metadata),
      requestId: createRequestId(input.requestId),
    },
  });
}
