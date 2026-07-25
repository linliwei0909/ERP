import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasPermission } from "../../src/lib/auth/rbac";
import {
  itemCompanyInputSchema,
  itemInputSchema,
  normalizeBarcode,
  normalizeItemCode,
} from "../../src/lib/items/validation";

const validItem = {
  code: "P-001",
  name: "測試品項",
  baseUnit: "PCS",
  itemType: "PRODUCT" as const,
};

describe("P2.3 item validation", () => {
  it("normalizes item and company codes with NFKC, trim and uppercase", () => {
    expect(normalizeItemCode("  ａｂ-１２  ")).toBe("AB-12");
    expect(
      itemCompanyInputSchema.parse({ companyItemCode: "  ｘ-１ " })
        .companyItemCode,
    ).toBe("ｘ-１");
  });

  it("normalizes barcode with trim and maps blank values to null", () => {
    expect(normalizeBarcode("  4712345  ")).toBe("4712345");
    expect(normalizeBarcode("   ")).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
  });

  it("requires code, name and base unit", () => {
    for (const field of ["code", "name", "baseUnit"] as const) {
      expect(() =>
        itemInputSchema.parse({ ...validItem, [field]: "   " }),
      ).toThrow();
    }
  });

  it("accepts only the formal item types", () => {
    expect(itemInputSchema.parse(validItem).itemType).toBe("PRODUCT");
    expect(
      itemInputSchema.parse({ ...validItem, itemType: "RAW_MATERIAL" })
        .itemType,
    ).toBe("RAW_MATERIAL");
    expect(() =>
      itemInputSchema.parse({ ...validItem, itemType: "SERVICE" }),
    ).toThrow();
  });

  it("grants item writes only to ADMIN", () => {
    expect(hasPermission(["ADMIN"], "items.manage")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "items.manage")).toBe(false);
    expect(hasPermission(["ORDER_ENTRY"], "items.read")).toBe(true);
  });

  it("does not expose hard-delete routes", () => {
    const collectionRoute = readFileSync(
      new URL("../../src/app/api/items/route.ts", import.meta.url),
      "utf8",
    );
    const detailRoute = readFileSync(
      new URL("../../src/app/api/items/[id]/route.ts", import.meta.url),
      "utf8",
    );
    expect(collectionRoute).not.toContain("function DELETE");
    expect(detailRoute).not.toContain("function DELETE");
  });
});
