import {
  Prisma,
  type DeliveryNote,
  type DeliveryNoteLine,
  type PrismaClient,
} from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { hasCompanyAccess } from "@/lib/auth/company-scope";
import { hasPermission, type Permission } from "@/lib/auth/rbac";
import type { RequestContext } from "@/lib/auth/session";
import { getCompanyLegalSettings } from "@/lib/company-settings/service";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteAlreadyExistsError,
  DeliveryNoteIdempotencyConflictError,
  DeliveryNoteInvariantError,
  DeliveryNoteNotFoundError,
  DeliveryNotePrerequisiteError,
  DeliveryNoteRevisionMismatchError,
} from "@/lib/delivery-notes/errors";
import {
  buildDeliveryNoteSnapshotsFromConfirmedOrder,
  type ConfirmedOrderForDeliveryNote,
} from "@/lib/delivery-notes/snapshots";
import type {
  CreateDeliveryNoteInput,
  CreateDeliveryNoteResult,
  CurrentDeliveryNoteResult,
  DeliveryNoteDetail,
  DeliveryNoteListFilters,
  DeliveryNoteListResult,
  DeliveryNoteSummary,
} from "@/lib/delivery-notes/types";
import {
  deliveryNoteListFiltersSchema,
  formatDateOnly,
  formatDeliveryNoteNumber,
  parseDateOnly,
  taipeiBusinessDate,
} from "@/lib/delivery-notes/validation";
import {
  executeIdempotent,
  IdempotencyConflictError,
} from "@/lib/idempotency";
import { assertDeliveryCreatedTransition } from "@/lib/sales-orders/state-machine";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const DELIVERY_NOTE_DOCUMENT_TYPE = "DELIVERY_NOTE";
const ORDER_VOID_REASON = "Sales order voided";

export type DeliveryNoteTransaction = Prisma.TransactionClient;

type LoadedDeliveryNote = DeliveryNote & {
  lines: DeliveryNoteLine[];
  salesOrder: { orderNumber: string };
  replacementDeliveryNote: { id: string } | null;
};

function auditContext(context: RequestContext, companyId: string) {
  return {
    companyId,
    actorUserId: context.actor.userId,
    sessionId: context.session.sessionId,
    requestId: context.requestId,
  };
}

function assertAccess(
  context: RequestContext,
  companyId: string,
  permission: Extract<
    Permission,
    "delivery_notes.read" | "delivery_notes.manage"
  >,
): void {
  const allowedCompany = hasCompanyAccess(
    context.authorizedCompanies.map((company) => company.id),
    companyId,
  );
  if (!allowedCompany || !hasPermission(context.roleCodes, permission)) {
    throw new DeliveryNoteAccessDeniedError();
  }
}

function snapshotCustomerName(value: Prisma.JsonValue): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = value.name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

function serializeSummary(note: LoadedDeliveryNote): DeliveryNoteSummary {
  return {
    id: note.id,
    companyId: note.companyId,
    deliveryNoteNumber: note.deliveryNoteNumber,
    deliveryNoteDate: formatDateOnly(note.deliveryNoteDate),
    fiscalYear: note.fiscalYear,
    fiscalMonth: note.fiscalMonth,
    salesOrderId: note.salesOrderId,
    salesOrderNumber: note.salesOrder.orderNumber,
    salesOrderRevisionNo: note.salesOrderRevisionNo,
    status: note.status,
    customerName: snapshotCustomerName(note.customerSnapshot),
    subtotal: note.subtotal.toFixed(0),
    freightAmount: note.freightAmount.toFixed(0),
    totalAmount: note.totalAmount.toFixed(0),
    createdAt: note.createdAt.toISOString(),
  };
}

function serializeDetail(note: LoadedDeliveryNote): DeliveryNoteDetail {
  return {
    ...serializeSummary(note),
    companySnapshot: note.companySnapshot,
    customerSnapshot: note.customerSnapshot,
    customerCompanySnapshot: note.customerCompanySnapshot,
    contactSnapshot: note.contactSnapshot,
    deliverySnapshot: note.deliverySnapshot,
    paymentTermsText: note.paymentTermsText,
    freightSnapshot: note.freightSnapshot,
    replacedDeliveryNoteId: note.replacedDeliveryNoteId,
    replacementDeliveryNoteId: note.replacementDeliveryNote?.id ?? null,
    voidSource: note.voidSource,
    voidedAt: note.voidedAt?.toISOString() ?? null,
    voidedById: note.voidedById,
    voidReason: note.voidReason,
    lines: note.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      salesOrderLineId: line.salesOrderLineId,
      itemId: line.itemId,
      itemSnapshot: line.itemSnapshot,
      priceSnapshot: line.priceSnapshot,
      quantity: line.quantity.toFixed(4),
      unitPrice: line.unitPrice.toFixed(5),
      lineAmount: line.lineAmount.toFixed(0),
    })),
  };
}

async function loadDeliveryNote(
  db: PrismaClient | DeliveryNoteTransaction,
  companyId: string,
  deliveryNoteId: string,
): Promise<LoadedDeliveryNote | null> {
  return db.deliveryNote.findFirst({
    where: { id: deliveryNoteId, companyId },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
      salesOrder: { select: { orderNumber: true } },
      replacementDeliveryNote: { select: { id: true } },
    },
  });
}

async function lockSalesOrder(
  tx: DeliveryNoteTransaction,
  companyId: string,
  salesOrderId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
      FROM "sales_orders"
     WHERE "id" = ${salesOrderId}::uuid
       AND "company_id" = ${companyId}::uuid
     FOR UPDATE
  `;
  if (!rows[0]) throw new DeliveryNoteNotFoundError();
}

async function lockCurrentDeliveryNote(
  tx: DeliveryNoteTransaction,
  companyId: string,
  salesOrderId: string,
): Promise<{
  id: string;
  sales_order_revision_no: number;
  status: "ACTIVE" | "SHIPPED" | "RECEIVABLE_CREATED";
} | null> {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      sales_order_revision_no: number;
      status: "ACTIVE" | "SHIPPED" | "RECEIVABLE_CREATED";
    }>
  >`
    SELECT "id", "sales_order_revision_no", "status"
      FROM "delivery_notes"
     WHERE "sales_order_id" = ${salesOrderId}::uuid
       AND "company_id" = ${companyId}::uuid
       AND "status" <> 'VOIDED'
     FOR UPDATE
  `;
  if (rows.length > 1) {
    throw new DeliveryNoteInvariantError(
      "同一訂單存在多張未作廢銷貨單",
    );
  }
  return rows[0] ?? null;
}

export async function allocateDeliveryNoteNumber(
  tx: DeliveryNoteTransaction,
  input: {
    companyId: string;
    deliveryNoteDate: Date;
    documentCompanyCode: string;
  },
): Promise<string> {
  const fiscalYear = input.deliveryNoteDate.getUTCFullYear();
  const fiscalMonth = input.deliveryNoteDate.getUTCMonth() + 1;
  const rows = await tx.$queryRaw<Array<{ last_value: bigint }>>`
    INSERT INTO "document_sequences" (
      "company_id", "fiscal_year", "fiscal_month", "document_type",
      "last_value", "created_at", "updated_at"
    )
    VALUES (
      ${input.companyId}::uuid, ${fiscalYear}, ${fiscalMonth},
      ${DELIVERY_NOTE_DOCUMENT_TYPE}, 1, now(), now()
    )
    ON CONFLICT (
      "company_id", "fiscal_year", "fiscal_month", "document_type"
    )
    DO UPDATE
       SET "last_value" = "document_sequences"."last_value" + 1,
           "updated_at" = now()
    RETURNING "last_value"
  `;
  const sequence = rows[0]?.last_value;
  if (!sequence) {
    throw new DeliveryNoteInvariantError("銷貨單流水號配置失敗");
  }
  try {
    return formatDeliveryNoteNumber({
      documentCompanyCode: input.documentCompanyCode,
      fiscalYear,
      fiscalMonth,
      sequence,
    });
  } catch (error) {
    throw new DeliveryNoteInvariantError(
      error instanceof Error ? error.message : "銷貨單號格式不合法",
    );
  }
}

export async function createDeliveryNoteFromOrder(
  db: PrismaClient,
  input: CreateDeliveryNoteInput,
): Promise<CreateDeliveryNoteResult> {
  assertAccess(input.context, input.companyId, "delivery_notes.manage");
  if (
    !Number.isInteger(input.expectedRevisionNo) ||
    input.expectedRevisionNo < 1
  ) {
    throw new DeliveryNoteRevisionMismatchError();
  }
  const now = input.now ?? new Date();
  try {
    const result = await executeIdempotent(
      db,
      {
        companyId: input.companyId,
        userId: input.context.actor.userId,
        operation: "delivery_note.create",
        key: input.idempotencyKey,
        payload: {
          companyId: input.companyId,
          salesOrderId: input.salesOrderId,
          expectedRevisionNo: input.expectedRevisionNo,
          actorUserId: input.context.actor.userId,
        },
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        now,
      },
      async (tx) => {
        await lockSalesOrder(tx, input.companyId, input.salesOrderId);
        const current = await lockCurrentDeliveryNote(
          tx,
          input.companyId,
          input.salesOrderId,
        );
        const order = await tx.salesOrder.findFirst({
          where: {
            id: input.salesOrderId,
            companyId: input.companyId,
          },
          include: {
            lines: {
              where: { isActive: true },
              orderBy: { lineNumber: "asc" },
            },
          },
        });
        if (!order) throw new DeliveryNoteNotFoundError();
        if (current) {
          if (current.sales_order_revision_no !== order.revisionNo) {
            throw new DeliveryNoteRevisionMismatchError();
          }
          throw new DeliveryNoteAlreadyExistsError();
        }
        if (order.status !== "CONFIRMED") {
          throw new DeliveryNotePrerequisiteError(
            "只有已確認訂單可以建立銷貨單",
          );
        }
        if (order.revisionNo !== input.expectedRevisionNo) {
          throw new DeliveryNoteRevisionMismatchError();
        }
        const snapshots = buildDeliveryNoteSnapshotsFromConfirmedOrder(
          order as ConfirmedOrderForDeliveryNote,
        );
        assertDeliveryCreatedTransition(order.status);
        const deliveryNoteDate = taipeiBusinessDate(now);
        const legalSettings = await getCompanyLegalSettings(
          tx,
          input.companyId,
          deliveryNoteDate,
        );
        const deliveryNoteNumber = await allocateDeliveryNoteNumber(tx, {
          companyId: input.companyId,
          deliveryNoteDate,
          documentCompanyCode: legalSettings.documentCompanyCode,
        });
        const deliveryNote = await tx.deliveryNote.create({
          data: {
            companyId: input.companyId,
            deliveryNoteNumber,
            deliveryNoteDate,
            fiscalYear: deliveryNoteDate.getUTCFullYear(),
            fiscalMonth: deliveryNoteDate.getUTCMonth() + 1,
            salesOrderId: order.id,
            status: "ACTIVE",
            ...snapshots.header,
            contactSnapshot:
              snapshots.header.contactSnapshot ?? Prisma.DbNull,
            createdById: input.context.actor.userId,
            updatedById: input.context.actor.userId,
          },
        });
        for (const line of [...snapshots.lines].sort(
          (left, right) => left.lineNumber - right.lineNumber,
        )) {
          await tx.deliveryNoteLine.create({
            data: {
              deliveryNoteId: deliveryNote.id,
              companyId: input.companyId,
              ...line,
              createdById: input.context.actor.userId,
            },
          });
        }
        const updatedOrder = await tx.salesOrder.update({
          where: { id: order.id },
          data: {
            status: "DELIVERY_CREATED",
            updatedById: input.context.actor.userId,
          },
        });
        const auditMetadata = {
          companyId: input.companyId,
          salesOrderId: order.id,
          salesOrderNumber: order.orderNumber,
          salesOrderRevisionNo: order.revisionNo,
          deliveryNoteId: deliveryNote.id,
          deliveryNoteNumber,
          deliveryNoteDate: formatDateOnly(deliveryNoteDate),
          subtotal: snapshots.header.subtotal,
          freightAmount: snapshots.header.freightAmount,
          totalAmount: snapshots.header.totalAmount,
          actorUserId: input.context.actor.userId,
          correlationId: input.context.requestId,
          idempotencyOperation: "delivery_note.create",
        };
        await writeAudit(tx, {
          ...auditContext(input.context, input.companyId),
          entityType: "delivery_note",
          entityId: deliveryNote.id,
          operation: "delivery_note.created",
          afterJson: {
            id: deliveryNote.id,
            deliveryNoteNumber,
            status: deliveryNote.status,
            salesOrderId: order.id,
            salesOrderRevisionNo: order.revisionNo,
          },
          metadata: auditMetadata,
        });
        await writeAudit(tx, {
          ...auditContext(input.context, input.companyId),
          entityType: "sales_order",
          entityId: order.id,
          operation: "sales_order.delivery_created",
          beforeJson: {
            status: order.status,
            revisionNo: order.revisionNo,
          },
          afterJson: {
            status: updatedOrder.status,
            revisionNo: updatedOrder.revisionNo,
            deliveryNoteId: deliveryNote.id,
          },
          metadata: auditMetadata,
        });
        return {
          value: { id: deliveryNote.id },
          responseStatus: 201,
          responseMetadata: {
            id: deliveryNote.id,
            deliveryNoteNumber,
            deliveryNoteDate: formatDateOnly(deliveryNoteDate),
          },
          resultReference: deliveryNote.id,
        };
      },
    );
    const deliveryNoteId = result.replayed
      ? result.resultReference
      : result.value.id;
    if (!deliveryNoteId) {
      throw new DeliveryNoteInvariantError("冪等結果缺少銷貨單識別碼");
    }
    const deliveryNote = await loadDeliveryNote(
      db,
      input.companyId,
      deliveryNoteId,
    );
    if (!deliveryNote) {
      throw new DeliveryNoteInvariantError("冪等結果指向不存在的銷貨單");
    }
    return {
      deliveryNote: serializeDetail(deliveryNote),
      replayed: result.replayed,
    };
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      throw new DeliveryNoteIdempotencyConflictError();
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DeliveryNoteAlreadyExistsError();
    }
    throw error;
  }
}

export async function voidDeliveryNoteForOrderVoid(
  tx: DeliveryNoteTransaction,
  input: {
    context: RequestContext;
    companyId: string;
    salesOrderId: string;
    now: Date;
  },
): Promise<string | null> {
  const current = await lockCurrentDeliveryNote(
    tx,
    input.companyId,
    input.salesOrderId,
  );
  if (!current) return null;
  if (current.status !== "ACTIVE") {
    throw new DeliveryNotePrerequisiteError(
      "已出貨或已建立應收的銷貨單不可隨訂單作廢",
    );
  }
  const before = await tx.deliveryNote.findUniqueOrThrow({
    where: { id: current.id },
  });
  const updated = await tx.deliveryNote.update({
    where: { id: current.id },
    data: {
      status: "VOIDED",
      voidSource: "ORDER_VOID",
      voidReason: ORDER_VOID_REASON,
      voidedAt: input.now,
      voidedById: input.context.actor.userId,
      updatedById: input.context.actor.userId,
    },
  });
  await writeAudit(tx, {
    ...auditContext(input.context, input.companyId),
    entityType: "delivery_note",
    entityId: updated.id,
    operation: "delivery_note.voided",
    reason: ORDER_VOID_REASON,
    beforeJson: { status: before.status },
    afterJson: {
      status: updated.status,
      voidSource: updated.voidSource,
      voidedAt: updated.voidedAt?.toISOString() ?? null,
    },
    metadata: {
      companyId: input.companyId,
      salesOrderId: input.salesOrderId,
      deliveryNoteNumber: updated.deliveryNoteNumber,
      actorUserId: input.context.actor.userId,
      correlationId: input.context.requestId,
    },
  });
  return updated.id;
}

export async function getDeliveryNote(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    deliveryNoteId: string;
  },
): Promise<DeliveryNoteDetail> {
  assertAccess(input.context, input.companyId, "delivery_notes.read");
  const note = await loadDeliveryNote(
    db,
    input.companyId,
    input.deliveryNoteId,
  );
  if (!note) throw new DeliveryNoteNotFoundError();
  return serializeDetail(note);
}

export async function listDeliveryNotes(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    filters?: DeliveryNoteListFilters;
  },
): Promise<DeliveryNoteListResult> {
  assertAccess(input.context, input.companyId, "delivery_notes.read");
  const filters = deliveryNoteListFiltersSchema.parse(input.filters ?? {});
  const where: Prisma.DeliveryNoteWhereInput = {
    companyId: input.companyId,
    ...(filters.status === "ALL" ? {} : { status: filters.status }),
    ...(filters.salesOrderId
      ? { salesOrderId: filters.salesOrderId }
      : {}),
    ...(filters.deliveryNoteNumber
      ? {
          deliveryNoteNumber: {
            contains: filters.deliveryNoteNumber,
            mode: "insensitive",
          },
        }
      : {}),
    ...(filters.deliveryNoteDateFrom || filters.deliveryNoteDateTo
      ? {
          deliveryNoteDate: {
            ...(filters.deliveryNoteDateFrom
              ? { gte: parseDateOnly(filters.deliveryNoteDateFrom) }
              : {}),
            ...(filters.deliveryNoteDateTo
              ? { lte: parseDateOnly(filters.deliveryNoteDateTo) }
              : {}),
          },
        }
      : {}),
    ...(filters.customerKeyword
      ? {
          customerSnapshot: {
            path: ["name"],
            string_contains: filters.customerKeyword,
          },
        }
      : {}),
  };
  const [total, notes] = await db.$transaction([
    db.deliveryNote.count({ where }),
    db.deliveryNote.findMany({
      where,
      include: {
        lines: { orderBy: { lineNumber: "asc" } },
        salesOrder: { select: { orderNumber: true } },
        replacementDeliveryNote: { select: { id: true } },
      },
      orderBy: [
        { deliveryNoteDate: "desc" },
        { deliveryNoteNumber: "desc" },
        { id: "desc" },
      ],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);
  return {
    deliveryNotes: notes.map(serializeSummary),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  };
}

export async function getCurrentDeliveryNoteForOrder(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    salesOrderId: string;
  },
): Promise<CurrentDeliveryNoteResult> {
  assertAccess(input.context, input.companyId, "delivery_notes.read");
  const order = await db.salesOrder.findFirst({
    where: { id: input.salesOrderId, companyId: input.companyId },
    select: { id: true },
  });
  if (!order) throw new DeliveryNoteNotFoundError();
  const notes = await db.deliveryNote.findMany({
    where: {
      companyId: input.companyId,
      salesOrderId: input.salesOrderId,
      status: { not: "VOIDED" },
    },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
      salesOrder: { select: { orderNumber: true } },
      replacementDeliveryNote: { select: { id: true } },
    },
    take: 2,
  });
  if (notes.length > 1) {
    throw new DeliveryNoteInvariantError(
      "同一訂單存在多張未作廢銷貨單",
    );
  }
  return notes[0] ? serializeDetail(notes[0]) : null;
}
