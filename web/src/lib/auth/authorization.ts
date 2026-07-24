import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { hasPermission, hasRole, type Permission } from "@/lib/auth/rbac";
import type { RequestContext } from "@/lib/auth/session";

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
    throw new AuthorizationError();
  }
}

export function requireAdmin(context: RequestContext): void {
  requireRole(context, ROLE_CODES.ADMIN);
}

export function requirePermission(
  context: RequestContext,
  permission: Permission,
): void {
  if (!hasPermission(context.roleCodes, permission)) {
    throw new AuthorizationError();
  }
}
