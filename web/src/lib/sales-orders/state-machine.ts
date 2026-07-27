import type { SalesOrderStatus } from "@/generated/prisma/client";

export class SalesOrderStatusTransitionError extends Error {
  readonly code = "ORDER_STATUS_TRANSITION_INVALID";

  constructor(from: SalesOrderStatus, to: SalesOrderStatus) {
    super(`訂單狀態不可由 ${from} 轉為 ${to}`);
  }
}
const P31_TRANSITIONS: ReadonlySet<string> = new Set([
  "DRAFT:CONFIRMED",
  "DRAFT:VOIDED",
  "CONFIRMED:DRAFT",
  "CONFIRMED:VOIDED",
]);

export function assertP31SalesOrderTransition(
  from: SalesOrderStatus,
  to: SalesOrderStatus,
): void {
  if (!P31_TRANSITIONS.has(`${from}:${to}`)) {
    throw new SalesOrderStatusTransitionError(from, to);
  }
}

export function canEditSalesOrderDraft(status: SalesOrderStatus): boolean {
  return status === "DRAFT";
}
