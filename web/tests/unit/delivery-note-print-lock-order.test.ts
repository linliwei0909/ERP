import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../src/generated/prisma/client";
import { DeliveryNoteSalesOrderStateError } from "../../src/lib/delivery-notes/errors";
import {
  acquireDeliveryNotePrintLocks,
  assertLockedDeliveryNoteRelation,
  DELIVERY_NOTE_PRINT_LOCK_ORDER,
} from "../../src/lib/delivery-notes/formal-print";

const companyId = "00000000-0000-0000-0000-000000000001";
const deliveryNoteId = "00000000-0000-0000-0000-000000000002";
const salesOrderId = "00000000-0000-0000-0000-000000000003";

function lockedNote(overrides: Record<string, unknown> = {}) {
  return {
    id: deliveryNoteId,
    companyId,
    salesOrderId,
    salesOrder: {
      id: salesOrderId,
      companyId,
      orderNumber: "SO-IN-202607-000001",
      customerId: "00000000-0000-0000-0000-000000000004",
      status: "DELIVERY_CREATED",
    },
    lines: [],
    printVersions: [],
    printEvents: [],
    ...overrides,
  };
}

function transaction(note = lockedNote()) {
  const sqlCalls: unknown[] = [];
  const tx = {
    deliveryNote: {
      findFirst: vi.fn(async () => ({ companyId, salesOrderId })),
      findFirstOrThrow: vi.fn(async () => note),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push({ strings: [...strings], values });
      return [{ id: sqlCalls.length === 1 ? salesOrderId : deliveryNoteId }];
    }),
  } as unknown as Prisma.TransactionClient;
  return { tx, sqlCalls };
}

describe("P3.3e delivery-note print lock contract", () => {
  it("publishes the formal idempotency, Sales Order, Delivery Note order", () => {
    expect(DELIVERY_NOTE_PRINT_LOCK_ORDER.slice(0, 3)).toEqual([
      "idempotency",
      "sales_order",
      "delivery_note",
    ]);
    expect(DELIVERY_NOTE_PRINT_LOCK_ORDER.join(" → ")).not.toContain(
      "delivery_note → sales_order",
    );
  });

  it("resolves relation identity, then actually locks Sales Order before Delivery Note", async () => {
    const { tx, sqlCalls } = transaction();
    const observed: string[] = [];

    await acquireDeliveryNotePrintLocks(
      tx,
      { companyId, deliveryNoteId },
      (lock) => {
        observed.push(lock);
      },
    );

    expect(observed).toEqual(["sales_order", "delivery_note"]);
    expect(sqlCalls).toHaveLength(2);
    const firstSql = sqlCalls[0] as { strings: string[]; values: unknown[] };
    const secondSql = sqlCalls[1] as { strings: string[]; values: unknown[] };
    expect(firstSql.strings.join("?")).toContain('FROM "sales_orders"');
    expect(secondSql.strings.join("?")).toContain('FROM "delivery_notes"');
    expect(firstSql.values).toEqual([salesOrderId, companyId]);
    expect(secondSql.values).toEqual([deliveryNoteId, companyId]);
    expect(firstSql.strings.join("")).not.toContain(salesOrderId);
    expect(secondSql.strings.join("")).not.toContain(deliveryNoteId);
  });

  it("rejects a company or relation change found by the locked reload", () => {
    expect(() =>
      assertLockedDeliveryNoteRelation(
        lockedNote({ salesOrderId: "00000000-0000-0000-0000-000000000099" }),
        { companyId, salesOrderId },
      ),
    ).toThrow(DeliveryNoteSalesOrderStateError);
    expect(() =>
      assertLockedDeliveryNoteRelation(
        lockedNote({ companyId: "00000000-0000-0000-0000-000000000099" }),
        { companyId, salesOrderId },
      ),
    ).toThrow(DeliveryNoteSalesOrderStateError);
  });
});
