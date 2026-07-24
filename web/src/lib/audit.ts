import type { Prisma } from "@/generated/prisma/client";

export type AuditInput = {
  companyId?: string | null;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  reason?: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  requestId?: string;
};

export function auditData(input: AuditInput) {
  return {
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    reason: input.reason,
    beforeValue: input.beforeValue,
    afterValue: input.afterValue,
    metadata: input.metadata,
    requestId: input.requestId,
  };
}
