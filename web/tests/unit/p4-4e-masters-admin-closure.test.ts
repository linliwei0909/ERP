import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

const routePages = [
  "customers/page.tsx", "customers/[id]/page.tsx", "admin/customers/page.tsx", "admin/customers/[id]/page.tsx",
  "items/page.tsx", "items/[id]/page.tsx", "admin/items/page.tsx", "admin/items/[id]/page.tsx",
  "pricing/lookup/page.tsx", "admin/pricing/page.tsx", "admin/pricing/[id]/page.tsx",
  "admin/company-settings/page.tsx", "admin/users/page.tsx",
  "admin/freight-rules/page.tsx", "admin/freight-rules/[id]/page.tsx",
  "admin/master-import/page.tsx", "admin/master-import/[id]/page.tsx",
];

describe("P4.4e Masters/Admin UI closure", () => {
  it("keeps all 17 route pages inside the App Shell page contract", () => {
    for (const route of routePages) {
      const page = source(`src/app/(authenticated)/${route}`);
      expect(page, route).not.toMatch(/max-w-|min-h-screen|px-6|py-12/);
      expect(page, route).not.toContain("<main");
    }
  });

  it("keeps server pages server-only and mutation clients explicitly client-side", () => {
    for (const route of routePages) expect(source(`src/app/(authenticated)/${route}`), route).not.toContain('"use client"');
    for (const client of [
      "admin/customers/customer-create-client.tsx", "admin/customers/[id]/customer-manager-client.tsx",
      "admin/items/item-create-client.tsx", "admin/items/[id]/item-manager-client.tsx",
      "admin/pricing/price-list-create-client.tsx", "admin/pricing/[id]/pricing-manager-client.tsx",
      "admin/company-settings/company-settings-client.tsx", "admin/users/user-action-button.tsx",
      "admin/freight-rules/freight-rule-create-client.tsx", "admin/freight-rules/[id]/freight-rule-editor.tsx",
      "admin/master-import/master-import-client.tsx",
    ]) expect(source(`src/app/(authenticated)/${client}`), client).toMatch(/^"use client";/);
  });

  it("uses shared dialogs instead of window.confirm in migrated admin actions", () => {
    for (const client of ["admin/company-settings/company-settings-client.tsx", "admin/master-import/master-import-client.tsx"]) {
      const value = source(`src/app/(authenticated)/${client}`);
      expect(value).toContain("ConfirmDialog");
      expect(value).not.toContain("window.confirm");
    }
  });

  it("has a validation record for every slice", () => {
    for (const document of [
      "../docs/P4_4A_CUSTOMERS_UI_VALIDATION.md", "../docs/P4_4B_ITEMS_UI_VALIDATION.md",
      "../docs/P4_4C_PRICING_UI_VALIDATION.md", "../docs/P4_4D_ADMIN_UI_VALIDATION.md",
    ]) expect(existsSync(resolve(process.cwd(), document)), document).toBe(true);
  });
});
