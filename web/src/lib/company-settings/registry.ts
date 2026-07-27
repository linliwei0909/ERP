import { z } from "zod";

export const COMPANY_SETTING_KEYS = {
  BILLING_CUTOFF_DAY: "billing_cutoff_day",
  COMPANY_NAME: "company_name",
  DOCUMENT_COMPANY_CODE: "document_company_code",
  COMPANY_TAX_ID: "company_tax_id",
  COMPANY_ADDRESS: "company_address",
  COMPANY_PHONE: "company_phone",
} as const;

export type CompanySettingKey =
  (typeof COMPANY_SETTING_KEYS)[keyof typeof COMPANY_SETTING_KEYS];

export const billingCutoffDaySchema = z
  .number()
  .int("公司切帳日必須是整數")
  .min(1, "公司切帳日不可小於 1")
  .max(31, "公司切帳日不可大於 31");

const requiredTrimmedString = (label: string) =>
  z
    .string(`${label}必須是字串`)
    .transform((value) => value.trim())
    .pipe(z.string().min(1, `${label}不可為空白`));

export const companyNameSchema = requiredTrimmedString("公司名稱");
export const documentCompanyCodeSchema = z
  .string("單據公司縮寫必須是字串")
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z
      .string()
      .length(2, "單據公司縮寫必須固定為兩碼")
      .regex(/^[A-Z]{2}$/, "單據公司縮寫只允許 A–Z"),
  );
export const companyTaxIdSchema = z
  .string("公司統編必須是字串")
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^[0-9]{8}$/, "公司統編必須是 8 碼數字"));
export const companyAddressSchema = requiredTrimmedString("公司地址");
export const companyPhoneSchema = requiredTrimmedString("公司電話");

const companySettingSchemas = Object.freeze({
  [COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY]: billingCutoffDaySchema,
  [COMPANY_SETTING_KEYS.COMPANY_NAME]: companyNameSchema,
  [COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE]:
    documentCompanyCodeSchema,
  [COMPANY_SETTING_KEYS.COMPANY_TAX_ID]: companyTaxIdSchema,
  [COMPANY_SETTING_KEYS.COMPANY_ADDRESS]: companyAddressSchema,
  [COMPANY_SETTING_KEYS.COMPANY_PHONE]: companyPhoneSchema,
}) satisfies Readonly<Record<CompanySettingKey, z.ZodType>>;

export type CompanySettingValueByKey = {
  [COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY]: number;
  [COMPANY_SETTING_KEYS.COMPANY_NAME]: string;
  [COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE]: string;
  [COMPANY_SETTING_KEYS.COMPANY_TAX_ID]: string;
  [COMPANY_SETTING_KEYS.COMPANY_ADDRESS]: string;
  [COMPANY_SETTING_KEYS.COMPANY_PHONE]: string;
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
