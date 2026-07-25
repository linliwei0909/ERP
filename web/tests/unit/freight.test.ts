import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasPermission } from "../../src/lib/auth/rbac";
import { calculateFreight } from "../../src/lib/freight/service";
import {
  freightLookupInputSchema,
  freightRuleInputSchema,
  quantitySchema,
} from "../../src/lib/freight/validation";

const base = {
  customerId: "00000000-0000-4000-8000-000000000001",
  deliveryLocationId: "00000000-0000-4000-8000-000000000002",
  validFrom: "2026-01-01",
};

describe("P2.5 freight validation and calculation", () => {
  it("enforces mode-specific amount fields", () => {
    expect(
      freightRuleInputSchema.parse({
        ...base,
        mode: "NO_CHARGE",
      }).unitFreight,
    ).toBeNull();
    expect(() =>
      freightRuleInputSchema.parse({
        ...base,
        mode: "NO_CHARGE",
        unitFreight: "1",
      }),
    ).toThrow("運費模式與金額欄位不一致");
    expect(
      freightRuleInputSchema.parse({
        ...base,
        mode: "QUANTITY_BASED",
        unitFreight: "0",
      }).unitFreight,
    ).toBe("0");
    expect(() =>
      freightRuleInputSchema.parse({
        ...base,
        mode: "QUANTITY_BASED",
        unitFreight: "1",
        fixedFreight: "2",
      }),
    ).toThrow();
    expect(
      freightRuleInputSchema.parse({
        ...base,
        mode: "FIXED_PER_LOCATION",
        fixedFreight: "0",
      }).fixedFreight,
    ).toBe("0");
  });

  it("rejects negative amounts, quantities and invalid periods", () => {
    expect(() =>
      freightRuleInputSchema.parse({
        ...base,
        mode: "QUANTITY_BASED",
        unitFreight: "-1",
      }),
    ).toThrow();
    expect(() => quantitySchema.parse("-0.1")).toThrow();
    expect(() =>
      freightRuleInputSchema.parse({
        ...base,
        mode: "NO_CHARGE",
        validTo: "2026-01-01",
      }),
    ).toThrow("失效日必須晚於生效日");
  });

  it("calculates all modes without floating-point arithmetic", () => {
    expect(calculateFreight({ mode: "NO_CHARGE", quantity: "999.9999" })).toBe(
      "0",
    );
    expect(
      calculateFreight({
        mode: "QUANTITY_BASED",
        quantity: "1.2345",
        unitFreight: "3",
      }),
    ).toBe("4");
    expect(
      calculateFreight({
        mode: "QUANTITY_BASED",
        quantity: "0.5000",
        unitFreight: "1",
      }),
    ).toBe("1");
    expect(
      calculateFreight({
        mode: "FIXED_PER_LOCATION",
        quantity: "0",
        fixedFreight: "125",
      }),
    ).toBe("125");
  });

  it("requires an explicit effective date", () => {
    expect(() =>
      freightLookupInputSchema.parse({
        companyId: "00000000-0000-4000-8000-000000000001",
        customerId: base.customerId,
        deliveryLocationId: base.deliveryLocationId,
        quantity: "1",
      }),
    ).toThrow();
  });

  it("grants freight writes only to ADMIN", () => {
    expect(hasPermission(["ADMIN"], "freight.manage")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "freight.manage")).toBe(false);
    expect(hasPermission(["ORDER_ENTRY"], "freight.read")).toBe(true);
  });

  it("keeps history APIs ADMIN-only and exposes no DELETE route", () => {
    for (const relative of [
      "../../src/app/api/admin/freight-rules/route.ts",
      "../../src/app/api/admin/freight-rules/[id]/route.ts",
    ]) {
      const source = readFileSync(new URL(relative, import.meta.url), "utf8");
      expect(source).toContain("requireAdminWithAudit");
      expect(source).not.toContain("function DELETE");
    }
  });
});
