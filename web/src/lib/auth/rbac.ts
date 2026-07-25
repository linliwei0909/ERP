import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";

export type Permission =
  | "admin.users.read"
  | "admin.users.manage"
  | "admin.sessions.revoke"
  | "company.switch"
  | "customers.read"
  | "customers.manage"
  | "items.read"
  | "items.manage";

const rolePermissions: Record<RoleCode, ReadonlySet<Permission>> = {
  [ROLE_CODES.ADMIN]: new Set<Permission>([
    "admin.users.read",
    "admin.users.manage",
    "admin.sessions.revoke",
    "company.switch",
    "customers.read",
    "customers.manage",
    "items.read",
    "items.manage",
  ]),
  [ROLE_CODES.ORDER_ENTRY]: new Set<Permission>([
    "company.switch",
    "customers.read",
    "items.read",
  ]),
};

export function hasRole(roleCodes: readonly string[], role: RoleCode): boolean {
  return roleCodes.includes(role);
}

export function hasPermission(
  roleCodes: readonly string[],
  permission: Permission,
): boolean {
  return roleCodes.some(
    (roleCode) =>
      roleCode in rolePermissions &&
      rolePermissions[roleCode as RoleCode].has(permission),
  );
}
