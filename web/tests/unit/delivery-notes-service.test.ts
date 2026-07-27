import { Prisma } from "../../src/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { hasPermission } from "../../src/lib/auth/rbac";
import {
  DeliveryNoteAdminVoidNotAllowedError,
  DeliveryNoteDownstreamLockedError,
  DeliveryNoteInvariantError,
  DeliveryNoteNotFoundError,
  DeliveryNoteRebuildNotAllowedError,
  DeliveryNoteRebuildRequiredError,
  DeliveryNoteReplacementConflictError,
  DeliveryNoteVoidReasonRequiredError,
} from "../../src/lib/delivery-notes/errors";
import { buildDeliveryNoteSnapshotsFromConfirmedOrder } from "../../src/lib/delivery-notes/snapshots";
import {
  assertRebuildPrerequisites,
  buildAdminVoidIdempotencyPayload,
  buildRebuildIdempotencyPayload,
  DELIVERY_NOTE_LOCK_ORDER,
} from "../../src/lib/delivery-notes/service";
import {
  deliveryNoteListFiltersSchema,
  formatDateOnly,
  formatDeliveryNoteNumber,
  normalizeDeliveryNoteVoidReason,
  taipeiBusinessDate,
} from "../../src/lib/delivery-notes/validation";
import {
  assertAdminVoidOrderTransition,
  assertDeliveryCreatedTransition,
  assertSalesOrderRevisionStartTransition,
  assertSalesOrderVoidTransition,
  SalesOrderStatusTransitionError,
} from "../../src/lib/sales-orders/state-machine";

function confirmedOrder() {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    companyId: "00000000-0000-0000-0000-000000000002",
    orderNumber: "SO-IN-202607-000001",
    status: "CONFIRMED" as const,
    revisionNo: 1,
    companySnapshot: { companyName: "奇麗實業有限公司" },
    customerSnapshot: { name: "快照客戶" },
    customerCompanySnapshot: { customerCode: "C001" },
    contactSnapshot: { name: "聯絡人" },
    deliverySnapshot: { fullAddress: "快照地址" },
    paymentTermsText: "月結 30 天",
    freightSnapshot: { mode: "FIXED", freightAmount: "5" },
    subtotal: new Prisma.Decimal(10),
    freightAmount: new Prisma.Decimal(5),
    totalAmount: new Prisma.Decimal(15),
    confirmedAt: new Date("2026-07-27T00:00:00.000Z"),
    confirmedById: "00000000-0000-0000-0000-000000000003",
    lines: [
      {
        id: "00000000-0000-0000-0000-000000000004",
        lineNumber: 1,
        itemId: "00000000-0000-0000-0000-000000000005",
        itemSnapshot: { code: "ITEM-1", name: "快照品項" },
        priceSnapshot: { priceSource: "STANDARD" },
        quantity: new Prisma.Decimal("1.0000"),
        unitPrice: new Prisma.Decimal("10.00000"),
        lineAmount: new Prisma.Decimal(10),
        isActive: true,
      },
    ],
  };
}

describe("delivery-note RBAC and errors", () => {
  it("grants read/manage to ADMIN and ORDER_ENTRY but admin_void only to ADMIN", () => {
    expect(hasPermission(["ADMIN"], "delivery_notes.read")).toBe(true);
    expect(hasPermission(["ADMIN"], "delivery_notes.manage")).toBe(true);
    expect(hasPermission(["ADMIN"], "delivery_notes.admin_void")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "delivery_notes.read")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "delivery_notes.manage")).toBe(true);
    expect(
      hasPermission(["ORDER_ENTRY"], "delivery_notes.admin_void"),
    ).toBe(false);
  });

  it("exposes stable typed business error codes", () => {
    expect(new DeliveryNoteNotFoundError().code).toBe(
      "DELIVERY_NOTE_NOT_FOUND",
    );
    expect(new DeliveryNoteInvariantError("test").code).toBe(
      "DELIVERY_NOTE_INVARIANT_VIOLATION",
    );
    expect(new DeliveryNoteRebuildRequiredError().code).toBe(
      "DELIVERY_NOTE_REBUILD_REQUIRED",
    );
    expect(new DeliveryNoteRebuildNotAllowedError().code).toBe(
      "DELIVERY_NOTE_REBUILD_NOT_ALLOWED",
    );
    expect(new DeliveryNoteReplacementConflictError().code).toBe(
      "DELIVERY_NOTE_REPLACEMENT_CONFLICT",
    );
    expect(new DeliveryNoteAdminVoidNotAllowedError().code).toBe(
      "DELIVERY_NOTE_ADMIN_VOID_NOT_ALLOWED",
    );
    expect(new DeliveryNoteVoidReasonRequiredError().code).toBe(
      "DELIVERY_NOTE_VOID_REASON_REQUIRED",
    );
    expect(new DeliveryNoteDownstreamLockedError().code).toBe(
      "DELIVERY_NOTE_DOWNSTREAM_LOCKED",
    );
  });
});

describe("delivery-note date and numbering", () => {
  it("uses the Asia/Taipei calendar date across UTC midnight", () => {
    expect(
      formatDateOnly(taipeiBusinessDate(new Date("2026-07-31T16:30:00Z"))),
    ).toBe("2026-08-01");
  });

  it("formats the company/month scoped six-digit number", () => {
    expect(
      formatDeliveryNoteNumber({
        documentCompanyCode: "IN",
        fiscalYear: 2026,
        fiscalMonth: 7,
        sequence: BigInt(1),
      }),
    ).toBe("DN-IN-202607-000001");
    expect(() =>
      formatDeliveryNoteNumber({
        documentCompanyCode: "industrial",
        fiscalYear: 2026,
        fiscalMonth: 7,
        sequence: BigInt(1),
      }),
    ).toThrow();
  });
});

describe("delivery-note snapshots and amounts", () => {
  it("copies only confirmed order snapshots and decimal values", () => {
    const result = buildDeliveryNoteSnapshotsFromConfirmedOrder(
      confirmedOrder(),
    );
    expect(result.header.customerSnapshot).toEqual({ name: "快照客戶" });
    expect(result.header.freightSnapshot).toEqual({
      mode: "FIXED",
      freightAmount: "5",
    });
    expect(result.header.totalAmount).toBe("15");
    expect(result.lines[0]).toMatchObject({
      quantity: "1.0000",
      unitPrice: "10.00000",
      lineAmount: "10",
    });
  });

  it("rejects missing snapshots and inconsistent decimal totals", () => {
    const missing = confirmedOrder();
    missing.freightSnapshot = {} as never;
    expect(() =>
      buildDeliveryNoteSnapshotsFromConfirmedOrder(missing),
    ).toThrow(DeliveryNoteInvariantError);

    const inconsistent = confirmedOrder();
    inconsistent.subtotal = new Prisma.Decimal(11);
    inconsistent.totalAmount = new Prisma.Decimal(16);
    expect(() =>
      buildDeliveryNoteSnapshotsFromConfirmedOrder(inconsistent),
    ).toThrow(DeliveryNoteInvariantError);
  });
});

describe("delivery-note query and state validation", () => {
  it("validates bounded filters and date order", () => {
    expect(
      deliveryNoteListFiltersSchema.parse({ page: 2, pageSize: 50 }),
    ).toMatchObject({ page: 2, pageSize: 50, status: "ALL" });
    expect(() =>
      deliveryNoteListFiltersSchema.parse({
        deliveryNoteDateFrom: "2026-08-01",
        deliveryNoteDateTo: "2026-07-31",
      }),
    ).toThrow();
    expect(() =>
      deliveryNoteListFiltersSchema.parse({ pageSize: 101 }),
    ).toThrow();
  });

  it("allows only the P3.2b order transitions", () => {
    expect(() => assertDeliveryCreatedTransition("CONFIRMED")).not.toThrow();
    expect(() => assertDeliveryCreatedTransition("DRAFT")).toThrow(
      SalesOrderStatusTransitionError,
    );
    expect(() => assertSalesOrderVoidTransition("DELIVERY_CREATED")).not.toThrow();
    expect(() => assertSalesOrderVoidTransition("SHIPPED")).toThrow(
      SalesOrderStatusTransitionError,
    );
    expect(() =>
      assertSalesOrderRevisionStartTransition("DELIVERY_CREATED"),
    ).not.toThrow();
    expect(() => assertSalesOrderRevisionStartTransition("SHIPPED")).toThrow(
      SalesOrderStatusTransitionError,
    );
    expect(() =>
      assertAdminVoidOrderTransition("DELIVERY_CREATED"),
    ).not.toThrow();
    expect(() => assertAdminVoidOrderTransition("CONFIRMED")).toThrow(
      SalesOrderStatusTransitionError,
    );
  });
});

describe("P3.2c rebuild and ADMIN void contracts", () => {
  it("validates the rebuild prerequisite matrix", () => {
    expect(() =>
      assertRebuildPrerequisites({
        orderStatus: "CONFIRMED",
        orderRevisionNo: 2,
        current: { status: "ACTIVE", salesOrderRevisionNo: 1 },
      }),
    ).not.toThrow();
    expect(() =>
      assertRebuildPrerequisites({
        orderStatus: "DRAFT",
        orderRevisionNo: 2,
        current: { status: "ACTIVE", salesOrderRevisionNo: 1 },
      }),
    ).toThrow(DeliveryNoteRebuildNotAllowedError);
    expect(() =>
      assertRebuildPrerequisites({
        orderStatus: "CONFIRMED",
        orderRevisionNo: 2,
        current: { status: "ACTIVE", salesOrderRevisionNo: 2 },
      }),
    ).toThrow(DeliveryNoteRebuildNotAllowedError);
    expect(() =>
      assertRebuildPrerequisites({
        orderStatus: "CONFIRMED",
        orderRevisionNo: 2,
        current: { status: "SHIPPED", salesOrderRevisionNo: 1 },
      }),
    ).toThrow(DeliveryNoteDownstreamLockedError);
  });

  it("builds stable idempotency fingerprints without generated values", () => {
    expect(
      buildRebuildIdempotencyPayload({
        companyId: "company",
        salesOrderId: "order",
        expectedRevisionNo: 2,
        oldDeliveryNoteReference: "old-note",
        actorUserId: "actor",
        reason: "revision",
      }),
    ).toEqual({
      companyId: "company",
      salesOrderId: "order",
      expectedRevisionNo: 2,
      oldDeliveryNoteReference: "old-note",
      actorUserId: "actor",
      reason: "revision",
    });
    expect(
      buildAdminVoidIdempotencyPayload({
        companyId: "company",
        deliveryNoteId: "note",
        voidReason: "trimmed",
        actorUserId: "actor",
      }),
    ).toEqual({
      companyId: "company",
      deliveryNoteId: "note",
      voidReason: "trimmed",
      actorUserId: "actor",
    });
  });

  it("normalizes void reasons and declares one lock order", () => {
    expect(normalizeDeliveryNoteVoidReason("  管理員作廢  ")).toBe(
      "管理員作廢",
    );
    expect(() => normalizeDeliveryNoteVoidReason("   ")).toThrow();
    expect(DELIVERY_NOTE_LOCK_ORDER).toEqual([
      "idempotency",
      "sales_order",
      "current_delivery_note",
      "document_sequence",
      "lines",
      "audit",
    ]);
  });
});
