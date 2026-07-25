import { z } from "zod";

export const freightModeSchema = z.enum([
  "NO_CHARGE",
  "QUANTITY_BASED",
  "FIXED_PER_LOCATION",
]);

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

const freightAmountSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,18}$/.test(value), {
    message: "運費必須為 0 至 18 位整數",
  })
  .transform((value) => BigInt(value).toString());

const nullableFreightAmountSchema = z
  .union([freightAmountSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" && value !== "" ? value : null));

export const quantitySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^(?:\d{1,14})(?:\.\d{1,4})?$/.test(value), {
    message: "數量必須為非負 numeric(18,4)",
  });

function validateModeAndPeriod(
  value: {
    mode: z.infer<typeof freightModeSchema>;
    unitFreight: string | null;
    fixedFreight: string | null;
    validFrom: Date;
    validTo: Date | null;
  },
  context: z.RefinementCtx,
) {
  const validAmounts =
    (value.mode === "NO_CHARGE" &&
      value.unitFreight === null &&
      value.fixedFreight === null) ||
    (value.mode === "QUANTITY_BASED" &&
      value.unitFreight !== null &&
      value.fixedFreight === null) ||
    (value.mode === "FIXED_PER_LOCATION" &&
      value.unitFreight === null &&
      value.fixedFreight !== null);
  if (!validAmounts) {
    context.addIssue({
      code: "custom",
      message: "運費模式與金額欄位不一致",
      path: ["mode"],
    });
  }
  if (value.validTo && value.validTo <= value.validFrom) {
    context.addIssue({
      code: "custom",
      message: "失效日必須晚於生效日",
      path: ["validTo"],
    });
  }
}

const freightRuleFields = {
  customerId: z.string().uuid(),
  deliveryLocationId: z.string().uuid(),
  mode: freightModeSchema,
  unitFreight: nullableFreightAmountSchema,
  fixedFreight: nullableFreightAmountSchema,
  validFrom: dateTextSchema,
  validTo: nullableDateTextSchema,
};

export const freightRuleInputSchema = z
  .object({
    ...freightRuleFields,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict()
  .superRefine(validateModeAndPeriod);

export const freightRuleUpdateSchema = z
  .object({
    ...freightRuleFields,
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict()
  .superRefine(validateModeAndPeriod);

export const freightLookupInputSchema = z.object({
  companyId: z.string().uuid(),
  customerId: z.string().uuid(),
  deliveryLocationId: z.string().uuid(),
  effectiveDate: dateTextSchema,
  quantity: quantitySchema,
});

export const freightRuleQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  deliveryLocationId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function toDateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}
