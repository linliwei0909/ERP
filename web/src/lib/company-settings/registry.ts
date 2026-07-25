import { z } from "zod";

export const COMPANY_SETTING_KEYS = {
  BILLING_CUTOFF_DAY: "billing_cutoff_day",
} as const;

export type CompanySettingKey =
  (typeof COMPANY_SETTING_KEYS)[keyof typeof COMPANY_SETTING_KEYS];

export const billingCutoffDaySchema = z
  .number()
  .int("公司切帳日必須是整數")
  .min(1, "公司切帳日不可小於 1")
  .max(31, "公司切帳日不可大於 31");

const companySettingSchemas = Object.freeze({
  [COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY]: billingCutoffDaySchema,
}) satisfies Readonly<Record<CompanySettingKey, z.ZodType>>;

export type CompanySettingValueByKey = {
  [COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY]: number;
};

export class UnregisteredCompanySettingError extends Error {
  readonly code = "UNREGISTERED_COMPANY_SETTING";

  constructor(settingKey: string) {
    super(`未登錄的公司設定鍵：${settingKey}`);
  }
}

export function validateCompanySetting<K extends CompanySettingKey>(
  settingKey: K,
  value: unknown,
): CompanySettingValueByKey[K];
export function validateCompanySetting(
  settingKey: string,
  value: unknown,
): unknown;
export function validateCompanySetting(
  settingKey: string,
  value: unknown,
): unknown {
  const schema = (
    companySettingSchemas as Readonly<Record<string, z.ZodType>>
  )[settingKey];

  if (!schema) {
    throw new UnregisteredCompanySettingError(settingKey);
  }

  return schema.parse(value);
}

export function isRegisteredCompanySetting(settingKey: string): boolean {
  return settingKey in companySettingSchemas;
}

export function assertCompanySettingKey(
  settingKey: string,
): asserts settingKey is CompanySettingKey {
  if (!isRegisteredCompanySetting(settingKey)) {
    throw new UnregisteredCompanySettingError(settingKey);
  }
}
