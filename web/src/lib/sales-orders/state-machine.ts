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

const P32B_TRANSITIONS: ReadonlySet<string> = new Set([
  "CONFIRMED:DELIVERY_CREATED",
  "DRAFT:VOIDED",
  "CONFIRMED:VOIDED",
  "DELIVERY_CREATED:VOIDED",
]);

const P32C_TRANSITIONS: ReadonlySet<string> = new Set([
  "CONFIRMED:DRAFT",
  "DELIVERY_CREATED:DRAFT",
  "CONFIRMED:DELIVERY_CREATED",
  "DELIVERY_CREATED:CONFIRMED",
]);

export function assertP31SalesOrderTransition(
  from: SalesOrderStatus,
  to: SalesOrderStatus,
): void {
  if (!P31_TRANSITIONS.has(`${from}:${to}`)) {
    throw new SalesOrderStatusTransitionError(from, to);
  }
}

export function assertDeliveryCreatedTransition(
  from: SalesOrderStatus,
): void {
  if (!P32B_TRANSITIONS.has(`${from}:DELIVERY_CREATED`)) {
    throw new SalesOrderStatusTransitionError(from, "DELIVERY_CREATED");
  }
}

export function assertSalesOrderVoidTransition(
  from: SalesOrderStatus,
): void {
  if (!P32B_TRANSITIONS.has(`${from}:VOIDED`)) {
    throw new SalesOrderStatusTransitionError(from, "VOIDED");
  }
}

export function assertSalesOrderRevisionStartTransition(
  from: SalesOrderStatus,
): void {
  if (!P32C_TRANSITIONS.has(`${from}:DRAFT`)) {
    throw new SalesOrderStatusTransitionError(from, "DRAFT");
  }
}

export function assertAdminVoidOrderTransition(
  from: SalesOrderStatus,
): void {
  if (!P32C_TRANSITIONS.has(`${from}:CONFIRMED`)) {
    throw new SalesOrderStatusTransitionError(from, "CONFIRMED");
  }
}

export function canEditSalesOrderDraft(status: SalesOrderStatus): boolean {
  return status === "DRAFT";
}
