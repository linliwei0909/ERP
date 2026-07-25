import { z } from "zod";

export function normalizeItemCode(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function normalizeBarcode(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function optionalText(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .nullable()
    .optional()
    .transform((value) => {
      const trimmed = typeof value === "string" ? value.trim() : "";
      return trimmed || null;
    });
}

export const itemInputSchema = z
  .object({
    code: z.string().trim().min(1, "品項代碼必填").max(100),
    name: z.string().trim().min(1, "品項名稱必填").max(200),
    description: optionalText(10_000),
    specification: optionalText(10_000),
    baseUnit: z.string().trim().min(1, "基本單位必填").max(50),
    barcode: optionalText(100),
    itemType: z.enum(["PRODUCT", "RAW_MATERIAL"]),
    salesEnabled: z.boolean().default(false),
    purchaseEnabled: z.boolean().default(false),
    inventoryEnabled: z.boolean().default(false),
    productionEnabled: z.boolean().default(false),
  })
  .strict();

export const itemCompanyInputSchema = z
  .object({
    companyItemCode: z
      .string()
      .trim()
      .min(1, "公司品項代碼必填")
      .max(100),
    salesEnabled: z.boolean().default(false),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

export const itemListQuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
  itemType: z.enum(["PRODUCT", "RAW_MATERIAL", "ALL"]).default("ALL"),
  availability: z
    .enum(["ALL", "AVAILABLE", "SALEABLE"])
    .default("SALEABLE"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
