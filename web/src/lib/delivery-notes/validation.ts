import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "日期不存在");

export const deliveryNoteListFiltersSchema = z
  .object({
    status: z
      .enum(["ACTIVE", "SHIPPED", "RECEIVABLE_CREATED", "VOIDED", "ALL"])
      .default("ALL"),
    salesOrderId: z.string().uuid().optional(),
    deliveryNoteNumber: z.string().trim().max(32).optional(),
    deliveryNoteDateFrom: dateOnlySchema.optional(),
    deliveryNoteDateTo: dateOnlySchema.optional(),
    customerKeyword: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (value) =>
      !value.deliveryNoteDateFrom ||
      !value.deliveryNoteDateTo ||
      value.deliveryNoteDateFrom <= value.deliveryNoteDateTo,
    {
      message: "銷貨單日期起日不得晚於迄日",
      path: ["deliveryNoteDateTo"],
    },
  );

export function parseDateOnly(value: string): Date {
  return new Date(`${dateOnlySchema.parse(value)}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function taipeiBusinessDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return parseDateOnly(`${values.year}-${values.month}-${values.day}`);
}

export function formatDeliveryNoteNumber(input: {
  documentCompanyCode: string;
  fiscalYear: number;
  fiscalMonth: number;
  sequence: bigint;
}): string {
  if (!/^[A-Z]{2}$/.test(input.documentCompanyCode)) {
    throw new Error("單據公司碼必須為兩碼大寫英文字母");
  }
  if (
    !Number.isInteger(input.fiscalYear) ||
    input.fiscalYear < 1 ||
    input.fiscalYear > 9999 ||
    !Number.isInteger(input.fiscalMonth) ||
    input.fiscalMonth < 1 ||
    input.fiscalMonth > 12 ||
    input.sequence < BigInt(1) ||
    input.sequence > BigInt(999_999)
  ) {
    throw new Error("銷貨單年月或流水號不合法");
  }
  return `DN-${input.documentCompanyCode}-${String(input.fiscalYear).padStart(
    4,
    "0",
  )}${String(input.fiscalMonth).padStart(2, "0")}-${input.sequence
    .toString()
    .padStart(6, "0")}`;
}

export function normalizeDeliveryNoteVoidReason(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("作廢理由必填");
  }
  if (normalized.length > 1000) {
    throw new Error("作廢理由不可超過 1000 個字元");
  }
  return normalized;
}
