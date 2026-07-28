import { Prisma, type SalesOrderStatus } from "@/generated/prisma/client";
import { DeliveryNoteInvariantError } from "@/lib/delivery-notes/errors";

export const DELIVERY_NOTE_SNAPSHOT_VERSION =
  "delivery-note-snapshot-v1" as const;

export type ConfirmedOrderForDeliveryNote = {
  id: string;
  companyId: string;
  orderNumber: string;
  status: SalesOrderStatus;
  revisionNo: number;
  customerSnapshot: Prisma.JsonValue;
  customerCompanySnapshot: Prisma.JsonValue;
  contactSnapshot: Prisma.JsonValue | null;
  deliverySnapshot: Prisma.JsonValue;
  companySnapshot: Prisma.JsonValue;
  paymentTermsText: string | null;
  freightSnapshot: Prisma.JsonValue | null;
  subtotal: Prisma.Decimal;
  freightAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  confirmedAt: Date | null;
  confirmedById: string | null;
  lines: Array<{
    id: string;
    lineNumber: number;
    itemId: string;
    itemSnapshot: Prisma.JsonValue;
    priceSnapshot: Prisma.JsonValue;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineAmount: Prisma.Decimal;
    isActive: boolean;
  }>;
};

function isNonEmptyObject(value: Prisma.JsonValue | null): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function cloneJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function buildDeliveryNoteSnapshotsFromConfirmedOrder(
  order: ConfirmedOrderForDeliveryNote,
) {
  if (
    order.status !== "CONFIRMED" ||
    !order.confirmedAt ||
    !order.confirmedById
  ) {
    throw new DeliveryNoteInvariantError("訂單尚未形成有效確認快照");
  }
  const requiredHeaderSnapshots = [
    order.companySnapshot,
    order.customerSnapshot,
    order.customerCompanySnapshot,
    order.deliverySnapshot,
    order.freightSnapshot,
  ];
  if (!requiredHeaderSnapshots.every(isNonEmptyObject)) {
    throw new DeliveryNoteInvariantError("訂單確認快照不完整");
  }
  const lines = order.lines.filter((line) => line.isActive);
  if (lines.length === 0) {
    throw new DeliveryNoteInvariantError("訂單至少需要一筆有效明細");
  }
  if (
    lines.some(
      (line) =>
        !isNonEmptyObject(line.itemSnapshot) ||
        !isNonEmptyObject(line.priceSnapshot),
    )
  ) {
    throw new DeliveryNoteInvariantError("訂單明細確認快照不完整");
  }
  const lineSum = lines.reduce(
    (total, line) => total.plus(line.lineAmount),
    new Prisma.Decimal(0),
  );
  if (!lineSum.equals(order.subtotal)) {
    throw new DeliveryNoteInvariantError("訂單明細金額合計與小計不一致");
  }
  if (!order.subtotal.plus(order.freightAmount).equals(order.totalAmount)) {
    throw new DeliveryNoteInvariantError("訂單小計、運費與總額不一致");
  }

  return {
    snapshotVersion: DELIVERY_NOTE_SNAPSHOT_VERSION,
    header: {
      companySnapshot: cloneJson(order.companySnapshot),
      customerSnapshot: cloneJson(order.customerSnapshot),
      customerCompanySnapshot: cloneJson(order.customerCompanySnapshot),
      contactSnapshot:
        order.contactSnapshot === null
          ? null
          : cloneJson(order.contactSnapshot),
      deliverySnapshot: cloneJson(order.deliverySnapshot),
      paymentTermsText: order.paymentTermsText,
      freightSnapshot: cloneJson(order.freightSnapshot!),
      subtotal: order.subtotal.toFixed(0),
      freightAmount: order.freightAmount.toFixed(0),
      totalAmount: order.totalAmount.toFixed(0),
      salesOrderRevisionNo: order.revisionNo,
    },
    lines: lines.map((line) => ({
      salesOrderLineId: line.id,
      lineNumber: line.lineNumber,
      itemId: line.itemId,
      itemSnapshot: cloneJson(line.itemSnapshot),
      priceSnapshot: cloneJson(line.priceSnapshot),
      quantity: line.quantity.toFixed(4),
      unitPrice: line.unitPrice.toFixed(5),
      lineAmount: line.lineAmount.toFixed(0),
    })),
  };
}
