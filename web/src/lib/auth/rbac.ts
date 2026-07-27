import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";

export type Permission =
  | "admin.users.read"
  | "admin.users.manage"
  | "admin.sessions.revoke"
  | "company.switch"
  | "customers.read"
  | "customers.manage"
  | "items.read"
  | "items.manage"
  | "pricing.read"
  | "pricing.manage"
  | "freight.read"
  | "freight.manage"
  | "sales_orders.read"
  | "sales_orders.manage"
  | "delivery_notes.read"
  | "delivery_notes.manage"
  | "delivery_notes.admin_void"
  | "master_import.read"
  | "master_import.manage";

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
    "pricing.read",
    "pricing.manage",
    "freight.read",
    "freight.manage",
    "sales_orders.read",
    "sales_orders.manage",
    "delivery_notes.read",
    "delivery_notes.manage",
    "delivery_notes.admin_void",
    "master_import.read",
    "master_import.manage",
  ]),
  [ROLE_CODES.ORDER_ENTRY]: new Set<Permission>([
    "company.switch",
    "customers.read",
    "items.read",
    "pricing.read",
    "freight.read",
    "sales_orders.read",
    "sales_orders.manage",
    "delivery_notes.read",
    "delivery_notes.manage",
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
