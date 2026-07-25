import { z } from "zod";

export function normalizeCode(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function normalizeTaxId(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\s-]/g, "");
}

export function normalizeForeignIdentifier(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
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

const baseCustomerSchema = {
  name: z.string().trim().min(1, "客戶名稱必填").max(200),
};

export const customerInputSchema = z.discriminatedUnion("customerType", [
  z
    .object({
      ...baseCustomerSchema,
      customerType: z.literal("DOMESTIC"),
      taxId: optionalText(32),
    })
    .strict(),
  z
    .object({
      ...baseCustomerSchema,
      customerType: z.literal("FOREIGN"),
      countryCode: z
        .string()
        .trim()
        .length(2, "境外客戶國別碼必須是兩碼")
        .transform((value) => value.toUpperCase())
        .refine((value) => /^[A-Z]{2}$/.test(value), "國別碼格式不正確"),
      foreignIdentifier: z
        .string()
        .trim()
        .min(1, "境外客戶識別碼必填")
        .max(100)
        .transform(normalizeForeignIdentifier),
    })
    .strict(),
]);

export const customerCompanyInputSchema = z.object({
  customerCode: z
    .string()
    .trim()
    .min(1, "公司客戶代碼必填")
    .max(50),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const customerContactInputSchema = z
  .object({
    name: z.string().trim().min(1, "聯絡人姓名必填").max(200),
    department: optionalText(100),
    jobTitle: optionalText(100),
    phone: optionalText(50),
    mobile: optionalText(50),
    email: optionalText(320).pipe(
      z.union([z.string().email("電子郵件格式不正確"), z.null()]),
    ),
    notes: optionalText(10_000),
    isPrimary: z.boolean().default(false),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .superRefine((value, context) => {
    if (!value.phone && !value.mobile && !value.email) {
      context.addIssue({
        code: "custom",
        message: "電話、手機或電子郵件至少一項必填",
        path: ["phone"],
      });
    }
  });

export const deliveryLocationInputSchema = z.object({
  code: z.string().trim().min(1, "送貨地點代碼必填").max(50),
  name: z.string().trim().min(1, "送貨地點名稱必填").max(200),
  recipientName: z.string().trim().min(1, "收件人必填").max(200),
  phone: z.string().trim().min(1, "送貨電話必填").max(50),
  postalCode: optionalText(20),
  city: optionalText(100),
  district: optionalText(100),
  addressLine: z.string().trim().min(1, "地址必填").max(300),
  notes: optionalText(10_000),
  isDefault: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const customerListQuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function buildFullAddress(input: {
  postalCode?: string | null;
  city?: string | null;
  district?: string | null;
  addressLine: string;
}): string {
  return [
    input.postalCode,
    input.city,
    input.district,
    input.addressLine,
  ]
    .filter((value): value is string => Boolean(value))
    .join("");
}
