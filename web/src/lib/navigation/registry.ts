import { ROLE_CODES } from "@/lib/auth/constants";
import { hasPermission, hasRole, type Permission } from "@/lib/auth/rbac";

export type NavigationGroupId =
  | "home"
  | "master-data"
  | "sales"
  | "system";

export type NavigationIconKey =
  | "home"
  | "customers"
  | "items"
  | "pricing"
  | "freight"
  | "orders"
  | "delivery"
  | "users"
  | "settings"
  | "import";

export type NavigationAuthorization =
  | { kind: "authenticated" }
  | { kind: "permissions"; allOf: readonly Permission[] }
  | { kind: "admin-only" };

export type NavigationDefinition = {
  id: string;
  label: string;
  href: string;
  group: NavigationGroupId;
  order: number;
  authorization: NavigationAuthorization;
  match: { kind: "exact" | "prefix"; value: string };
  icon: NavigationIconKey;
  companySwitchTarget: "same-list" | "module-list" | "home";
};

export type NavigationGroup = {
  id: NavigationGroupId;
  label: string;
  order: number;
  items: NavigationDefinition[];
};

const definitions = [
  {
    id: "home",
    label: "作業首頁",
    href: "/",
    group: "home",
    order: 10,
    authorization: { kind: "authenticated" },
    match: { kind: "exact", value: "/" },
    icon: "home",
    companySwitchTarget: "home",
  },
  {
    id: "customers",
    label: "客戶查詢",
    href: "/customers",
    group: "master-data",
    order: 10,
    authorization: { kind: "permissions", allOf: ["customers.read"] },
    match: { kind: "prefix", value: "/customers" },
    icon: "customers",
    companySwitchTarget: "same-list",
  },
  {
    id: "items",
    label: "品項查詢",
    href: "/items",
    group: "master-data",
    order: 20,
    authorization: { kind: "permissions", allOf: ["items.read"] },
    match: { kind: "prefix", value: "/items" },
    icon: "items",
    companySwitchTarget: "same-list",
  },
  {
    id: "pricing",
    label: "正式價格查詢",
    href: "/pricing/lookup",
    group: "master-data",
    order: 30,
    authorization: {
      kind: "permissions",
      allOf: ["customers.read", "items.read", "pricing.read"],
    },
    match: { kind: "prefix", value: "/pricing" },
    icon: "pricing",
    companySwitchTarget: "same-list",
  },
  {
    id: "freight",
    label: "運費試算",
    href: "/freight/quote",
    group: "master-data",
    order: 40,
    authorization: {
      kind: "permissions",
      allOf: ["customers.read", "freight.read"],
    },
    match: { kind: "prefix", value: "/freight" },
    icon: "freight",
    companySwitchTarget: "same-list",
  },
  {
    id: "sales-orders",
    label: "銷售訂單",
    href: "/sales-orders",
    group: "sales",
    order: 10,
    authorization: {
      kind: "permissions",
      allOf: ["sales_orders.read"],
    },
    match: { kind: "prefix", value: "/sales-orders" },
    icon: "orders",
    companySwitchTarget: "module-list",
  },
  {
    id: "delivery-notes",
    label: "銷貨單",
    href: "/delivery-notes",
    group: "sales",
    order: 20,
    authorization: {
      kind: "permissions",
      allOf: ["delivery_notes.read"],
    },
    match: { kind: "prefix", value: "/delivery-notes" },
    icon: "delivery",
    companySwitchTarget: "module-list",
  },
  {
    id: "admin-users",
    label: "使用者與授權",
    href: "/admin/users",
    group: "system",
    order: 10,
    authorization: { kind: "admin-only" },
    match: { kind: "prefix", value: "/admin/users" },
    icon: "users",
    companySwitchTarget: "home",
  },
  {
    id: "admin-company-settings",
    label: "公司設定",
    href: "/admin/company-settings",
    group: "system",
    order: 20,
    authorization: { kind: "admin-only" },
    match: { kind: "prefix", value: "/admin/company-settings" },
    icon: "settings",
    companySwitchTarget: "home",
  },
  {
    id: "admin-customers",
    label: "客戶主檔",
    href: "/admin/customers",
    group: "system",
    order: 30,
    authorization: { kind: "admin-only" },
    match: { kind: "prefix", value: "/admin/customers" },
    icon: "customers",
    companySwitchTarget: "home",
  },
  {
    id: "admin-items",
    label: "品項主檔",
    href: "/admin/items",
    group: "system",
    order: 40,
    authorization: { kind: "admin-only" },
    match: { kind: "prefix", value: "/admin/items" },
    icon: "items",
    companySwitchTarget: "home",
  },
  {
    id: "admin-pricing",
    label: "價格管理",
    href: "/admin/pricing",
    group: "system",
    order: 50,
    authorization: { kind: "admin-only" },
    match: { kind: "prefix", value: "/admin/pricing" },
    icon: "pricing",
    companySwitchTarget: "home",
  },
  {
    id: "admin-freight",
    label: "運費規則",
    href: "/admin/freight-rules",
    group: "system",
    order: 60,
    authorization: { kind: "admin-only" },
    match: { kind: "prefix", value: "/admin/freight-rules" },
    icon: "freight",
    companySwitchTarget: "home",
  },
  {
    id: "admin-master-import",
    label: "主檔匯入",
    href: "/admin/master-import",
    group: "system",
    order: 70,
    authorization: { kind: "admin-only" },
    match: { kind: "prefix", value: "/admin/master-import" },
    icon: "import",
    companySwitchTarget: "home",
  },
] as const satisfies readonly NavigationDefinition[];

const groupMetadata: ReadonlyArray<
  Omit<NavigationGroup, "items">
> = [
  { id: "home", label: "作業首頁", order: 10 },
  { id: "master-data", label: "查詢", order: 20 },
  { id: "sales", label: "銷售作業", order: 30 },
  { id: "system", label: "系統管理", order: 40 },
];

export const navigationDefinitions: readonly NavigationDefinition[] =
  definitions;

export function isNavigationAuthorized(
  definition: NavigationDefinition,
  roleCodes: readonly string[],
): boolean {
  switch (definition.authorization.kind) {
    case "authenticated":
      return true;
    case "admin-only":
      return hasRole(roleCodes, ROLE_CODES.ADMIN);
    case "permissions":
      return definition.authorization.allOf.every((permission) =>
        hasPermission(roleCodes, permission),
      );
  }
}

export function buildNavigation(
  roleCodes: readonly string[],
): NavigationGroup[] {
  return groupMetadata
    .map((group) => ({
      ...group,
      items: definitions
        .filter(
          (item) =>
            item.group === group.id &&
            isNavigationAuthorized(item, roleCodes),
        )
        .sort((left, right) => left.order - right.order),
    }))
    .filter((group) => group.items.length > 0)
    .sort((left, right) => left.order - right.order);
}

export function isNavigationActive(
  definition: NavigationDefinition,
  pathname: string,
): boolean {
  if (definition.match.kind === "exact") {
    return pathname === definition.match.value;
  }
  return (
    pathname === definition.match.value ||
    pathname.startsWith(`${definition.match.value}/`)
  );
}
