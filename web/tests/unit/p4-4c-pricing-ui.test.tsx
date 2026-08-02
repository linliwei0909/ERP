import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceListCreateClient } from "../../src/app/(authenticated)/admin/pricing/price-list-create-client";
import { PricingManagerClient } from "../../src/app/(authenticated)/admin/pricing/[id]/pricing-manager-client";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

const priceList = {
  id: "price-list-a", code: "RETAIL", name: "零售價", status: "ACTIVE" as const,
  itemPrices: [{ id: "price-a", itemId: "item-a", unitPrice: "123.45000", validFrom: "2026-08-01", validTo: null, status: "ACTIVE" as const, item: { code: "ITEM-001", name: "測試品項" } }],
  assignments: [{ id: "assignment-a", customerId: "customer-a", validFrom: "2026-08-01", validTo: null, status: "ACTIVE" as const, customer: { name: "測試客戶" } }],
};

describe("P4.4c Pricing UI migration", () => {
  it("renders accessible create and management forms without nested main", () => {
    const create = renderToStaticMarkup(<PriceListCreateClient companyId="company-a" />);
    const manager = renderToStaticMarkup(<PricingManagerClient priceList={priceList} companyId="company-a" items={[{ id: "item-a", label: "ITEM-001－測試品項" }]} customers={[{ id: "customer-a", label: "測試客戶" }]} />);
    expect(`${create}${manager}`).not.toContain("<main");
    for (const field of ["code", "name", "status", "itemId", "unitPrice", "validFrom", "validTo", "customerId"]) expect(`${create}${manager}`).toContain(`name="${field}"`);
    expect(manager).toContain("123.45000");
    expect(manager).toContain("調整期間");
    expect(manager).toContain("（必填）");
  });

  it("renders explicit empty states for versions and assignments", () => {
    const html = renderToStaticMarkup(<PricingManagerClient priceList={{ ...priceList, itemPrices: [], assignments: [] }} companyId="company-a" items={[]} customers={[]} />);
    expect(html).toContain("尚無品項價格版本");
    expect(html).toContain("尚無客戶價格表指派");
  });

  it("keeps lookup query, effective-price service and not-found contract", () => {
    const lookup = source("src/app/(authenticated)/pricing/lookup/page.tsx");
    for (const query of ["companyId", "customerId", "itemId", "effectiveDate"]) expect(lookup).toContain(query);
    expect(lookup).toContain("getEffectivePrice(prisma");
    expect(lookup).toContain("error instanceof PriceNotFoundError");
    expect(lookup).toContain("PRICE_NOT_FOUND");
    expect(lookup).not.toContain("<main");
  });

  it("keeps authorization, route, endpoints and pricing payload boundaries", () => {
    for (const path of ["src/app/(authenticated)/pricing/lookup/page.tsx", "src/app/(authenticated)/admin/pricing/page.tsx", "src/app/(authenticated)/admin/pricing/[id]/page.tsx"]) {
      const page = source(path);
      expect(page).not.toMatch(/max-w-|min-h-screen|px-6|py-12/);
      expect(page).not.toContain("<main");
      expect(page).not.toContain('"use client"');
    }
    const list = source("src/app/(authenticated)/admin/pricing/page.tsx");
    expect(list).toContain("requireAdminWithAudit(prisma, context)");
    expect(list).toContain("listPriceLists(prisma");
    expect(list).toContain("pageHref");
    const detail = source("src/app/(authenticated)/admin/pricing/[id]/page.tsx");
    expect(detail).toContain("toDateText(value.validFrom)");
    expect(detail).toContain("toDateText(value.validTo)");
    const manager = source("src/app/(authenticated)/admin/pricing/[id]/pricing-manager-client.tsx");
    for (const endpoint of ["/api/admin/price-lists/${priceList.id}", "/api/admin/price-lists/${priceList.id}/prices", "/api/admin/item-prices/${version.id}", "/api/admin/customer-price-list-assignments", "/api/admin/customer-price-list-assignments/${assignment.id}"]) expect(manager).toContain(endpoint);
    for (const field of ["itemId", "unitPrice", "validFrom", "validTo", "status", "customerId"]) expect(manager).toContain(`form.get("${field}")`);
    expect(manager).toContain("priceListId: priceList.id");
    expect(manager).toContain('"idempotency-key": crypto.randomUUID()');
  });
});
