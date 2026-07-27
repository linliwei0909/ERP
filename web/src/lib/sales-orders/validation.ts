import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "日期不存在");

const nullableText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || null;
  });

export const salesOrderLineInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    itemId: z.string().uuid(),
    quantity: z.union([z.string(), z.number()]),
    unitPrice: z.union([z.string(), z.number(), z.null()]).optional(),
    manualPriceReason: nullableText,
  })
  .strict();

export const salesOrderDraftInputSchema = z
  .object({
    orderDate: dateOnlySchema,
    customerId: z.string().uuid(),
    deliveryLocationId: z.string().uuid(),
    customerContactId: z.string().uuid().nullable().optional(),
    paymentTermsText: nullableText,
    lines: z.array(salesOrderLineInputSchema).max(200).default([]),
  })
  .strict();

export const salesOrderQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z
    .enum([
      "DRAFT",
      "CONFIRMED",
      "DELIVERY_CREATED",
      "SHIPPED",
      "COMPLETED",
      "VOIDED",
      "ALL",
    ])
    .default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const voidSalesOrderSchema = z.object({
  reason: z.string().trim().min(1, "作廢理由必填").max(1000),
});

export const salesOrderIdSchema = z.string().uuid();

export type SalesOrderDraftInput = z.input<
  typeof salesOrderDraftInputSchema
>;
export type SalesOrderLineInput = z.input<
  typeof salesOrderLineInputSchema
>;

export function parseDateOnly(value: string): Date {
  const parsed = dateOnlySchema.parse(value);
  return new Date(`${parsed}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
