export { formatDate, formatMoney, formatQuantity, nextDocumentNumber, nullableText, parseDate } from "@/lib/procurement";

export const salesOrderStatusLabel = {
  DRAFT: "草稿",
  CONFIRMED: "已確認",
  PARTIALLY_DELIVERED: "部分銷貨",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
} as const;

export const salesDeliveryStatusLabel = {
  DRAFT: "草稿",
  PENDING_ISSUE: "待出庫",
  ISSUED: "已出庫",
  CANCELLED: "已取消",
} as const;

export const arInvoiceStatusLabel = {
  DRAFT: "草稿",
  POSTED: "已立帳",
  PARTIALLY_RECEIVED: "部分收款",
  PAID: "已收清",
  VOID: "已作廢",
} as const;

export const receiptStatusLabel = {
  DRAFT: "草稿",
  CONFIRMED: "已確認",
  ALLOCATED: "已沖帳",
  VOID: "已作廢",
} as const;
