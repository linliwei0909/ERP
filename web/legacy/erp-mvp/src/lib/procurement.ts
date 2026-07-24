import type { Prisma } from "@/generated/prisma/client";

export const requisitionStatusLabel = {
  DRAFT: "草稿",
  PENDING_APPROVAL: "待核准",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
  PARTIALLY_ORDERED: "部分採購",
  COMPLETED: "已轉採購",
  CANCELLED: "已取消",
} as const;

export const purchaseOrderStatusLabel = {
  DRAFT: "草稿",
  PENDING_CONFIRMATION: "待確認",
  CONFIRMED: "已確認",
  PARTIALLY_RECEIVED: "部分進貨",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
} as const;

export const goodsReceiptStatusLabel = {
  DRAFT: "草稿",
  PENDING_INSPECTION: "待驗收",
  PARTIALLY_ACCEPTED: "部分合格",
  RECEIVED: "已入庫",
  RETURNED: "已退貨",
  CANCELLED: "已取消",
} as const;

export const apInvoiceStatusLabel = {
  DRAFT: "草稿",
  PENDING_MATCH: "待核對",
  POSTED: "已立帳",
  PARTIALLY_PAID: "部分付款",
  PAID: "已付清",
  VOID: "已作廢",
} as const;

export const paymentStatusLabel = {
  DRAFT: "草稿",
  CONFIRMED: "已確認",
  ALLOCATED: "已沖帳",
  VOID: "已作廢",
} as const;

export function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(value) : "—";
}

export function formatMoney(value: { toString(): string } | number | string, currency = "TWD") {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TWD" ? 0 : 2,
  }).format(Number(value));
}

export function formatQuantity(value: { toString(): string } | number | string) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 3 }).format(Number(value));
}

export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
  documentType: string,
  prefix: string,
  date: Date,
) {
  const dateKey = date.toISOString().slice(0, 10).replaceAll("-", "");
  const sequence = await tx.documentSequence.upsert({
    where: { companyId_documentType_dateKey: { companyId, documentType, dateKey } },
    create: { companyId, documentType, dateKey, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return `${prefix}-${dateKey}-${String(sequence.lastNumber).padStart(3, "0")}`;
}

export function parseDate(value: FormDataEntryValue | null, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (required) throw new Error("日期為必填");
    return null;
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("日期格式不正確");
  return date;
}

export function nullableText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}
