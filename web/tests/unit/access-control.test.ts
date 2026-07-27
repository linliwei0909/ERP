import { describe, expect, it } from "vitest";
import {
  assertCompanyAccess,
  assertSelectedCompany,
  chooseSelectedCompany,
  CompanyAccessError,
} from "../../src/lib/auth/company-scope";
import { hasPermission, hasRole } from "../../src/lib/auth/rbac";

describe("RBAC", () => {
  it("allows ADMIN and restricts ORDER_ENTRY administrator permissions", () => {
    expect(hasRole(["ADMIN"], "ADMIN")).toBe(true);
    expect(hasPermission(["ADMIN"], "admin.users.manage")).toBe(true);
    expect(
      hasPermission(["ORDER_ENTRY"], "admin.users.manage"),
    ).toBe(false);
    expect(hasPermission(["ORDER_ENTRY"], "company.switch")).toBe(true);
    expect(hasPermission(["ADMIN"], "master_import.manage")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "master_import.read")).toBe(false);
    expect(hasPermission(["ORDER_ENTRY"], "sales_orders.read")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "sales_orders.manage")).toBe(true);
  });
});

describe("company scope", () => {
  it("chooses only an authorized selected or default company", () => {
    expect(
      chooseSelectedCompany({
        authorizedCompanyIds: ["company-a", "company-b"],
        selectedCompanyId: "forged-company",
        defaultCompanyId: "company-b",
      }),
    ).toBe("company-b");
  });

  it("rejects a forged company id", () => {
    expect(() =>
      assertCompanyAccess(["company-a"], "forged-company"),
    ).toThrow(CompanyAccessError);
  });

  it("requires a selected company for a protected request", () => {
    expect(() => assertSelectedCompany(null)).toThrow(CompanyAccessError);
    expect(() => assertSelectedCompany({ id: "company-a" })).not.toThrow();
  });
});
