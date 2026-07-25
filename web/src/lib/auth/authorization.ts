import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { hasPermission, hasRole, type Permission } from "@/lib/auth/rbac";
import type { RequestContext } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { PrismaClient } from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";

export class AuthorizationError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor() {
    super("沒有執行此操作的權限");
  }
}

export function requireRole(
  context: RequestContext,
  role: RoleCode,
): void {
  if (!hasRole(context.roleCodes, role)) {
    logger.warn("Role authorization denied", {
      event: "auth.role.forbidden",
      actorUserId: context.actor.userId,
      companyId: context.selectedCompany?.id,
      requestId: context.requestId,
      requiredRole: role,
    });
    throw new AuthorizationError();
  }
}

export function requireAdmin(context: RequestContext): void {
  requireRole(context, ROLE_CODES.ADMIN);
}

export async function requireAdminWithAudit(
  db: PrismaClient,
  context: RequestContext,
): Promise<void> {
  try {
    requireAdmin(context);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      await db.$transaction((tx) =>
        writeAudit(tx, {
          ...systemAuditContext({
            companyId: context.selectedCompany?.id,
            actorUserId: context.actor.userId,
            sessionId: context.session.sessionId,
            requestId: context.requestId,
          }),
          entityType: "user",
          entityId: context.actor.userId,
          operation: "auth.role.forbidden",
          metadata: { requiredRole: ROLE_CODES.ADMIN },
        }),
      );
    }
    throw error;
  }
}

export function requirePermission(
  context: RequestContext,
  permission: Permission,
): void {
  if (!hasPermission(context.roleCodes, permission)) {
    logger.warn("Permission authorization denied", {
      event: "auth.permission.forbidden",
      actorUserId: context.actor.userId,
      companyId: context.selectedCompany?.id,
      requestId: context.requestId,
      permission,
    });
    throw new AuthorizationError();
  }
}
