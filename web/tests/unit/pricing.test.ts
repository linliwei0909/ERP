import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasPermission } from "../../src/lib/auth/rbac";
import {
  itemPriceInputSchema,
  normalizePriceListCode,
  priceAssignmentInputSchema,
  priceLookupInputSchema,
} from "../../src/lib/pricing/validation";

describe("P2.4 pricing validation", () => {
  it("normalizes price-list codes", () => {
    expect(normalizePriceListCode("  ｐ-０１ ")).toBe("P-01");
  });

  it("accepts zero and five decimal places and rejects negatives", () => {
    expect(
      itemPriceInputSchema.parse({
        itemId: "00000000-0000-4000-8000-000000000001",
        unitPrice: "0",
        validFrom: "2026-01-01",
      }).unitPrice,
    ).toBe("0");
    expect(
      itemPriceInputSchema.parse({
        itemId: "00000000-0000-4000-8000-000000000001",
        unitPrice: "12.34567",
        validFrom: "2026-01-01",
      }).unitPrice,
    ).toBe("12.34567");
    expect(() =>
      itemPriceInputSchema.parse({
        itemId: "00000000-0000-4000-8000-000000000001",
        unitPrice: "-1",
        validFrom: "2026-01-01",
      }),
    ).toThrow();
  });

  it("rejects invalid periods and accepts open periods", () => {
    expect(
      priceAssignmentInputSchema.parse({
        customerId: "00000000-0000-4000-8000-000000000001",
        priceListId: "00000000-0000-4000-8000-000000000002",
        validFrom: "2026-01-01",
        validTo: "",
      }).validTo,
    ).toBeNull();
    expect(() =>
      priceAssignmentInputSchema.parse({
        customerId: "00000000-0000-4000-8000-000000000001",
        priceListId: "00000000-0000-4000-8000-000000000002",
        validFrom: "2026-02-01",
        validTo: "2026-02-01",
      }),
    ).toThrow("失效日必須晚於生效日");
  });

  it("requires an explicit effective date", () => {
    expect(() =>
      priceLookupInputSchema.parse({
        companyId: "00000000-0000-4000-8000-000000000001",
        customerId: "00000000-0000-4000-8000-000000000002",
        itemId: "00000000-0000-4000-8000-000000000003",
      }),
    ).toThrow();
  });

  it("grants pricing writes only to ADMIN", () => {
    expect(hasPermission(["ADMIN"], "pricing.manage")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "pricing.manage")).toBe(false);
    expect(hasPermission(["ORDER_ENTRY"], "pricing.read")).toBe(true);
  });

  it("keeps price-list history endpoints ADMIN-only", () => {
    for (const relative of [
      "../../src/app/api/admin/price-lists/route.ts",
      "../../src/app/api/admin/price-lists/[id]/route.ts",
    ]) {
      expect(readFileSync(new URL(relative, import.meta.url), "utf8")).toContain(
        "requireAdminWithAudit",
      );
    }
  });

  it("does not expose hard-delete routes", () => {
    for (const relative of [
      "../../src/app/api/admin/price-lists/route.ts",
      "../../src/app/api/admin/price-lists/[id]/route.ts",
      "../../src/app/api/admin/item-prices/[id]/route.ts",
      "../../src/app/api/admin/customer-price-list-assignments/[id]/route.ts",
    ]) {
      expect(readFileSync(new URL(relative, import.meta.url), "utf8")).not.toContain(
        "function DELETE",
      );
    }
  });
});
