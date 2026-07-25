import { describe, expect, it } from "vitest";
import {
  buildFullAddress,
  customerContactInputSchema,
  customerInputSchema,
  deliveryLocationInputSchema,
  normalizeCode,
  normalizeTaxId,
} from "../../src/lib/customers/validation";
import { hasPermission } from "../../src/lib/auth/rbac";

describe("P2.2 customer validation", () => {
  it("normalizes tax IDs and company codes", () => {
    expect(normalizeTaxId(" 12-34 5678 ")).toBe("12345678");
    expect(normalizeCode("  ab-01 ")).toBe("AB-01");
  });

  it("accepts valid domestic and foreign identities", () => {
    expect(
      customerInputSchema.parse({
        customerType: "DOMESTIC",
        name: "境內客戶",
        taxId: "",
      }),
    ).toMatchObject({ customerType: "DOMESTIC", taxId: null });
    expect(
      customerInputSchema.parse({
        customerType: "FOREIGN",
        name: "Foreign customer",
        countryCode: "us",
        foreignIdentifier: " ab-123 ",
      }),
    ).toMatchObject({
      countryCode: "US",
      foreignIdentifier: "AB-123",
    });
  });

  it("rejects mixed or incomplete identity fields", () => {
    expect(() =>
      customerInputSchema.parse({
        customerType: "DOMESTIC",
        name: "錯誤客戶",
        taxId: "12345678",
        foreignIdentifier: "FOREIGN",
      }),
    ).toThrow();
    expect(() =>
      customerInputSchema.parse({
        customerType: "FOREIGN",
        name: "Missing ID",
        countryCode: "US",
        foreignIdentifier: "",
      }),
    ).toThrow();
  });

  it("requires at least one contact method", () => {
    expect(() =>
      customerContactInputSchema.parse({
        name: "王小明",
        phone: "",
        mobile: "",
        email: "",
      }),
    ).toThrow("電話、手機或電子郵件至少一項必填");
    expect(
      customerContactInputSchema.parse({
        name: "王小明",
        phone: "02-12345678",
      }).phone,
    ).toBe("02-12345678");
  });

  it("builds a full address from structured fields", () => {
    const location = deliveryLocationInputSchema.parse({
      code: "A01",
      name: "台北倉",
      recipientName: "王小明",
      phone: "02-12345678",
      postalCode: "100",
      city: "臺北市",
      district: "中正區",
      addressLine: "測試路1號",
    });
    expect(buildFullAddress(location)).toBe(
      "100臺北市中正區測試路1號",
    );
  });

  it("grants read to ORDER_ENTRY but management only to ADMIN", () => {
    expect(hasPermission(["ORDER_ENTRY"], "customers.read")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "customers.manage")).toBe(false);
    expect(hasPermission(["ADMIN"], "customers.manage")).toBe(true);
  });
});
