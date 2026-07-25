import { z } from "zod";

export function normalizePriceListCode(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

const dateTextSchema = z
  .union([
    z.date(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD"),
  ])
  .transform((value, context) => {
    const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    const date = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
      context.addIssue({ code: "custom", message: "日期不存在" });
      return z.NEVER;
    }
    return date;
  });

const nullableDateTextSchema = z
  .union([dateTextSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value instanceof Date ? value : null));

const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(?:\.\d{1,5})?$/.test(value), {
    message: "未稅單價必須為非負數且最多五位小數",
  });

function validPeriod<T extends { validFrom: Date; validTo: Date | null }>(
  value: T,
  context: z.RefinementCtx,
) {
  if (value.validTo && value.validTo <= value.validFrom) {
    context.addIssue({
      code: "custom",
      message: "失效日必須晚於生效日",
      path: ["validTo"],
    });
  }
}

export const priceListInputSchema = z
  .object({
    code: z.string().trim().min(1, "價格表代碼必填").max(100),
    name: z.string().trim().min(1, "價格表名稱必填").max(200),
  })
  .strict();

export const itemPriceInputSchema = z
  .object({
    itemId: z.string().uuid(),
    unitPrice: moneySchema,
    validFrom: dateTextSchema,
    validTo: nullableDateTextSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict()
  .superRefine(validPeriod);

export const periodAdjustmentSchema = z
  .object({
    validFrom: dateTextSchema,
    validTo: nullableDateTextSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict()
  .superRefine(validPeriod);

export const priceAssignmentInputSchema = z
  .object({
    customerId: z.string().uuid(),
    priceListId: z.string().uuid(),
    validFrom: dateTextSchema,
    validTo: nullableDateTextSchema,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict()
  .superRefine(validPeriod);

export const priceLookupInputSchema = z.object({
  companyId: z.string().uuid(),
  customerId: z.string().uuid(),
  itemId: z.string().uuid(),
  effectiveDate: dateTextSchema,
});

export const priceListQuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function toDateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}
