import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  billingCutoffDaySchema,
  COMPANY_SETTING_KEYS,
  isRegisteredCompanySetting,
  validateCompanySetting,
} from "../../src/lib/company-settings/registry";
import {
  CompanySettingMissingError,
  formatDateOnly,
  getBillingCutoffDay,
  resolveBillingCutoffDateFromDay,
} from "../../src/lib/company-settings/service";

describe("company setting schema registry", () => {
  it.each([1, 25, 31])(
    "accepts billing_cutoff_day=%s",
    (value) => {
      expect(billingCutoffDaySchema.parse(value)).toBe(value);
      expect(
        validateCompanySetting(
          COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
          value,
        ),
      ).toBe(value);
    },
  );

  it.each([0, 32, 1.5, "25", null])(
    "rejects an invalid billing_cutoff_day=%s",
    (value) => {
      expect(() => billingCutoffDaySchema.parse(value)).toThrow();
    },
  );

  it("rejects keys that have not been registered by the application", () => {
    expect(isRegisteredCompanySetting("unknown.setting")).toBe(false);
    expect(() =>
      validateCompanySetting("unknown.setting", { value: true }),
    ).toThrow("未登錄的公司設定鍵");
  });
});

describe("billing cutoff date resolution", () => {
  it("clamps day 31 to the end of February", () => {
    expect(formatDateOnly(resolveBillingCutoffDateFromDay(31, 2026, 2))).toBe(
      "2026-02-28",
    );
  });

  it("clamps day 31 to April 30", () => {
    expect(formatDateOnly(resolveBillingCutoffDateFromDay(31, 2026, 4))).toBe(
      "2026-04-30",
    );
  });

  it("resolves leap-year February correctly", () => {
    expect(formatDateOnly(resolveBillingCutoffDateFromDay(31, 2028, 2))).toBe(
      "2028-02-29",
    );
  });

  it("uses the effective version returned for the requested date", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "setting-a",
      companyId: "company-a",
      settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
      settingValue: 25,
      effectiveFrom: new Date("2026-06-01T00:00:00Z"),
    });
    const db = {
      companySetting: { findFirst },
    } as unknown as PrismaClient;

    await expect(
      getBillingCutoffDay(db, "company-a", new Date("2026-07-01T00:00:00Z")),
    ).resolves.toBe(25);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        companyId: "company-a",
        settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
        effectiveFrom: { lte: new Date("2026-07-01T00:00:00.000Z") },
      },
      orderBy: { effectiveFrom: "desc" },
    });
  });

  it("reports a missing setting instead of applying a default", async () => {
    const db = {
      companySetting: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(
      getBillingCutoffDay(db, "company-a", new Date("2026-07-01T00:00:00Z")),
    ).rejects.toBeInstanceOf(CompanySettingMissingError);
  });
});
