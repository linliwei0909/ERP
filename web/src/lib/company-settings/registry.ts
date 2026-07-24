import { z } from "zod";

const companySettingSchemas: Readonly<Record<string, z.ZodType>> =
  Object.freeze({});

export function validateCompanySetting(
  settingKey: string,
  value: unknown,
): unknown {
  const schema = companySettingSchemas[settingKey];

  if (!schema) {
    throw new Error(`未登錄的公司設定鍵：${settingKey}`);
  }

  return schema.parse(value);
}

export function isRegisteredCompanySetting(settingKey: string): boolean {
  return settingKey in companySettingSchemas;
}
