import { createHash } from "node:crypto";
import {
  Prisma,
  type DeliveryNotePrintEvent,
  type DeliveryNotePrintVersion,
  type PrismaClient,
} from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { hasCompanyAccess } from "@/lib/auth/company-scope";
import { hasPermission } from "@/lib/auth/rbac";
import type { RequestContext } from "@/lib/auth/session";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteFormalPrintExistsError,
  DeliveryNoteFormalPrintMissingError,
  DeliveryNoteIdempotencyConflictError,
  DeliveryNoteNotFoundError,
  DeliveryNotePdfRenderError,
  DeliveryNoteFontError,
  DeliveryNotePrintConcurrencyError,
  DeliveryNotePrintStateError,
  DeliveryNoteSalesOrderStateError,
} from "@/lib/delivery-notes/errors";
import { parseDeliveryNoteSnapshot } from "@/lib/delivery-notes/print-model";
import {
  DeterministicDeliveryNotePdfRenderer,
  type DeliveryNotePdfRenderer,
  type RenderedDeliveryNotePdf,
} from "@/lib/delivery-notes/renderer";
import { formatDateOnly, taipeiBusinessDate } from "@/lib/delivery-notes/validation";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency";
import {
  assertSalesOrderShippedTransition,
  SalesOrderStatusTransitionError,
} from "@/lib/sales-orders/state-machine";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const FORMAL_PRINT_OPERATION = "delivery_note.formal_print";
const REPRINT_OPERATION = "delivery_note.reprint";

export const DELIVERY_NOTE_PRINT_LOCK_ORDER = [
  "idempotency",
  "sales_order",
  "delivery_note",
  "formal_print_version_invariant",
  "formal_print_event_invariant",
  "audit",
] as const;

export type DeliveryNotePrintRowLock = "sales_order" | "delivery_note";
type LockObserver = (
  lock: DeliveryNotePrintRowLock,
) => void | Promise<void>;

export type DeliveryNotePrintServiceInput = {
  context: RequestContext;
  companyId: string;
  deliveryNoteId: string;
  idempotencyKey: string;
  now?: Date;
};

export type DeliveryNotePrintResult = Readonly<{
  deliveryNoteId: string;
  deliveryNoteNumber: string;
  deliveryNoteStatus: "SHIPPED";
  salesOrderId: string;
  salesOrderNumber: string;
  salesOrderStatus: "SHIPPED";
  actualDeliveryDate: string;
  firstPrintedAt: string;
  firstPrintedById: string;
  reprintCount: number;
  printVersionId: string;
  printEventId: string;
  documentVersion: number;
  rendererVersion: string;
  templateVersion: string;
  fontVersion: string;
  snapshotVersion: string;
  contentHash: string;
  mimeType: string;
  byteSize: number;
  filename: string;
  replayed: boolean;
}>;

type Tx = Prisma.TransactionClient;

function assertAccess(context: RequestContext, companyId: string): void {
  if (
    !hasCompanyAccess(
      context.authorizedCompanies.map((company) => company.id),
      companyId,
    ) ||
    !hasPermission(context.roleCodes, "delivery_notes.manage")
  ) {
    throw new DeliveryNoteAccessDeniedError();
  }
}

function auditContext(context: RequestContext, companyId: string) {
  return {
    companyId,
    actorUserId: context.actor.userId,
    sessionId: context.session.sessionId,
    requestId: context.requestId,
  };
}

function idempotencyPayload(input: DeliveryNotePrintServiceInput) {
  return {
    companyId: input.companyId,
    deliveryNoteId: input.deliveryNoteId,
    actorUserId: input.context.actor.userId,
  };
}

async function lockDeliveryNote(
  tx: Tx,
  companyId: string,
  deliveryNoteId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
      FROM "delivery_notes"
     WHERE "id" = ${deliveryNoteId}::uuid
       AND "company_id" = ${companyId}::uuid
     FOR UPDATE
  `;
  if (!rows[0]) throw new DeliveryNoteNotFoundError();
}

async function lockSalesOrder(
  tx: Tx,
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
  if (!rows[0]) {
    throw new DeliveryNoteSalesOrderStateError("找不到銷貨單的來源訂單");
  }
}

async function loadLockedNote(tx: Tx, companyId: string, deliveryNoteId: string) {
  return tx.deliveryNote.findFirstOrThrow({
    where: { id: deliveryNoteId, companyId },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
      salesOrder: {
        select: {
          id: true,
          companyId: true,
          orderNumber: true,
          customerId: true,
          status: true,
        },
      },
      printVersions: true,
      printEvents: true,
    },
  });
}

async function resolveDeliveryNoteRelationIdentity(
  tx: Tx,
  companyId: string,
  deliveryNoteId: string,
): Promise<{ companyId: string; salesOrderId: string }> {
  const relation = await tx.deliveryNote.findFirst({
    where: { id: deliveryNoteId, companyId },
    select: { companyId: true, salesOrderId: true },
  });
  if (!relation) throw new DeliveryNoteNotFoundError();
  return relation;
}

export function assertLockedDeliveryNoteRelation(
  note: {
    companyId: string;
    salesOrderId: string;
    salesOrder: { id: string; companyId: string };
  },
  expected: {
    companyId: string;
    salesOrderId: string;
  },
): void {
  if (
    note.companyId !== expected.companyId ||
    note.salesOrderId !== expected.salesOrderId ||
    note.salesOrder.id !== expected.salesOrderId ||
    note.salesOrder.companyId !== expected.companyId
  ) {
    throw new DeliveryNoteSalesOrderStateError(
      "銷貨單與訂單的公司或來源關聯不一致",
    );
  }
}

export async function acquireDeliveryNotePrintLocks(
  tx: Tx,
  input: {
    companyId: string;
    deliveryNoteId: string;
  },
  lockObserver?: LockObserver,
) {
  // This lookup resolves identity only. Business decisions use the locked reload.
  const relation = await resolveDeliveryNoteRelationIdentity(
    tx,
    input.companyId,
    input.deliveryNoteId,
  );
  await lockSalesOrder(tx, input.companyId, relation.salesOrderId);
  await lockObserver?.("sales_order");
  await lockDeliveryNote(tx, input.companyId, input.deliveryNoteId);
  await lockObserver?.("delivery_note");
  const note = await loadLockedNote(
    tx,
    input.companyId,
    input.deliveryNoteId,
  );
  assertLockedDeliveryNoteRelation(note, relation);
  return note;
}

function validateRenderedPdf(
  rendered: RenderedDeliveryNotePdf,
  snapshotVersion: string,
): void {
  if (
    rendered.mimeType !== "application/pdf" ||
    rendered.byteSize !== rendered.bytes.byteLength ||
    rendered.byteSize < 1 ||
    rendered.byteSize > 20 * 1024 * 1024 ||
    rendered.snapshotVersion !== snapshotVersion ||
    createHash("sha256").update(rendered.bytes).digest("hex") !== rendered.sha256
  ) {
    throw new DeliveryNotePdfRenderError(
      "DELIVERY_NOTE_PRINT_STORAGE_INVALID",
      "Renderer 輸出與正式儲存 metadata 不一致",
    );
  }
}

function resultFrom(
  note: {
    id: string;
    deliveryNoteNumber: string;
    salesOrderId: string;
    salesOrder: { orderNumber: string };
    actualDeliveryDate: Date | null;
    firstPrintedAt: Date | null;
    firstPrintedById: string | null;
    reprintCount: number;
  },
  version: DeliveryNotePrintVersion,
  event: DeliveryNotePrintEvent,
  replayed: boolean,
): DeliveryNotePrintResult {
  if (
    !note.actualDeliveryDate ||
    !note.firstPrintedAt ||
    !note.firstPrintedById
  ) {
    throw new DeliveryNotePdfRenderError(
      "DELIVERY_NOTE_PRINT_STORAGE_INVALID",
      "正式列印摘要不完整",
    );
  }
  return Object.freeze({
    deliveryNoteId: note.id,
    deliveryNoteNumber: note.deliveryNoteNumber,
    deliveryNoteStatus: "SHIPPED",
    salesOrderId: note.salesOrderId,
    salesOrderNumber: note.salesOrder.orderNumber,
    salesOrderStatus: "SHIPPED",
    actualDeliveryDate: formatDateOnly(note.actualDeliveryDate),
    firstPrintedAt: note.firstPrintedAt.toISOString(),
    firstPrintedById: note.firstPrintedById,
    reprintCount: note.reprintCount,
    printVersionId: version.id,
    printEventId: event.id,
    documentVersion: version.documentVersion,
    rendererVersion: version.rendererVersion,
    templateVersion: version.templateVersion,
    fontVersion: version.fontVersion,
    snapshotVersion: version.snapshotVersion,
    contentHash: version.contentHash,
    mimeType: version.mimeType,
    byteSize: version.byteSize,
    filename: version.filename,
    replayed,
  });
}

async function loadPersistedResult(
  db: PrismaClient,
  input: DeliveryNotePrintServiceInput,
  eventId?: string,
): Promise<DeliveryNotePrintResult> {
  const note = await db.deliveryNote.findFirst({
    where: { id: input.deliveryNoteId, companyId: input.companyId },
    include: {
      salesOrder: { select: { orderNumber: true } },
      printVersions: true,
      printEvents: {
        where: eventId ? { id: eventId } : { eventType: "FORMAL_PRINT" },
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
    },
  });
  const version = note?.printVersions[0];
  const event = note?.printEvents[0];
  if (!note || !version || !event) throw new DeliveryNoteFormalPrintMissingError();
  return resultFrom(note, version, event, true);
}

function mapInfrastructureError(error: unknown): never {
  if (error instanceof IdempotencyConflictError) {
    throw new DeliveryNoteIdempotencyConflictError();
  }
  if (error instanceof IdempotencyInProgressError) {
    throw new DeliveryNotePrintConcurrencyError("相同正式列印操作仍在處理中");
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  ) {
    throw new DeliveryNotePrintConcurrencyError();
  }
  throw error;
}

export async function formalPrintDeliveryNote(
  db: PrismaClient,
  input: DeliveryNotePrintServiceInput,
  dependencies: {
    renderer?: DeliveryNotePdfRenderer;
    auditWriter?: typeof writeAudit;
    lockObserver?: LockObserver;
  } = {},
): Promise<DeliveryNotePrintResult> {
  assertAccess(input.context, input.companyId);
  const now = input.now ?? new Date();
  const renderer =
    dependencies.renderer ?? new DeterministicDeliveryNotePdfRenderer();
  const auditWriter = dependencies.auditWriter ?? writeAudit;
  try {
    const executed = await executeIdempotent(db, {
      companyId: input.companyId,
      userId: input.context.actor.userId,
      operation: FORMAL_PRINT_OPERATION,
      key: input.idempotencyKey,
      payload: idempotencyPayload(input),
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      now,
    }, async (tx) => {
      const note = await acquireDeliveryNotePrintLocks(
        tx,
        input,
        dependencies.lockObserver,
      );

      if (note.status !== "ACTIVE") {
        if (note.printVersions.length > 0) throw new DeliveryNoteFormalPrintExistsError();
        throw new DeliveryNotePrintStateError();
      }
      try {
        assertSalesOrderShippedTransition(note.salesOrder.status);
      } catch (error) {
        if (error instanceof SalesOrderStatusTransitionError) {
          throw new DeliveryNoteSalesOrderStateError(error.message);
        }
        throw error;
      }
      if (note.printVersions.length > 0) throw new DeliveryNoteFormalPrintExistsError();
      if (note.printEvents.some((event) => event.eventType === "FORMAL_PRINT")) {
        throw new DeliveryNoteFormalPrintExistsError();
      }

      const actualDeliveryDate = taipeiBusinessDate(now);
      const model = parseDeliveryNoteSnapshot(note, {
        actualDeliveryDate,
        formalPrintedAt: now,
      });
      let rendered: RenderedDeliveryNotePdf;
      try {
        rendered = await renderer.render(model);
      } catch (error) {
        if (
          error instanceof DeliveryNotePdfRenderError ||
          error instanceof DeliveryNoteFontError
        ) {
          throw error;
        }
        throw new DeliveryNotePdfRenderError(
          "DELIVERY_NOTE_PDF_RENDER_FAILED",
          `正式銷貨單 PDF 產生失敗：${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
      }
      validateRenderedPdf(rendered, note.snapshotVersion);
      const version = await tx.deliveryNotePrintVersion.create({
        data: {
          companyId: note.companyId,
          deliveryNoteId: note.id,
          documentVersion: rendered.documentVersion,
          rendererVersion: rendered.rendererVersion,
          templateVersion: rendered.templateVersion,
          fontVersion: rendered.fontVersion,
          snapshotVersion: rendered.snapshotVersion,
          generatedAt: now,
          generatedById: input.context.actor.userId,
          contentHash: rendered.sha256,
          mimeType: rendered.mimeType,
          byteSize: rendered.byteSize,
          filename: rendered.filename,
          pdfBytes: new Uint8Array(rendered.bytes),
        },
      });
      const event = await tx.deliveryNotePrintEvent.create({
        data: {
          companyId: note.companyId,
          deliveryNoteId: note.id,
          printVersionId: version.id,
          eventType: "FORMAL_PRINT",
          occurredAt: now,
          actorUserId: input.context.actor.userId,
          sessionId: input.context.session.sessionId,
          requestId: input.context.requestId,
        },
      });
      const updatedNote = await tx.deliveryNote.update({
        where: { id: note.id },
        data: {
          status: "SHIPPED",
          actualDeliveryDate,
          firstPrintedAt: now,
          firstPrintedById: input.context.actor.userId,
          reprintCount: 0,
          updatedById: input.context.actor.userId,
        },
        include: { salesOrder: { select: { orderNumber: true } } },
      });
      await tx.salesOrder.update({
        where: { id: note.salesOrderId },
        data: {
          status: "SHIPPED",
          updatedById: input.context.actor.userId,
        },
      });
      await auditWriter(tx, {
        ...auditContext(input.context, input.companyId),
        entityType: "delivery_note",
        entityId: note.id,
        operation: FORMAL_PRINT_OPERATION,
        beforeJson: {
          deliveryNoteStatus: note.status,
          salesOrderStatus: note.salesOrder.status,
        },
        afterJson: {
          deliveryNoteStatus: "SHIPPED",
          salesOrderStatus: "SHIPPED",
          actualDeliveryDate: formatDateOnly(actualDeliveryDate),
          firstPrintedAt: now.toISOString(),
          firstPrintedById: input.context.actor.userId,
        },
        metadata: {
          deliveryNoteNumber: note.deliveryNoteNumber,
          salesOrderId: note.salesOrderId,
          salesOrderNumber: note.salesOrder.orderNumber,
          printVersionId: version.id,
          printEventId: event.id,
          contentHash: version.contentHash,
          documentVersion: version.documentVersion,
          rendererVersion: version.rendererVersion,
          templateVersion: version.templateVersion,
          fontVersion: version.fontVersion,
          snapshotVersion: version.snapshotVersion,
          idempotencyOperation: FORMAL_PRINT_OPERATION,
          idempotencyKeyHash: createHash("sha256")
            .update(input.idempotencyKey)
            .digest("hex"),
          correlationId: input.context.requestId,
        },
      });
      const value = resultFrom(updatedNote, version, event, false);
      return {
        value,
        responseStatus: 200,
        responseMetadata: { eventId: event.id },
        resultReference: version.id,
      };
    });
    if (!executed.replayed) return executed.value;
    return loadPersistedResult(db, input);
  } catch (error) {
    return mapInfrastructureError(error);
  }
}

export async function reprintDeliveryNote(
  db: PrismaClient,
  input: DeliveryNotePrintServiceInput,
  dependencies: {
    lockObserver?: LockObserver;
  } = {},
): Promise<DeliveryNotePrintResult> {
  assertAccess(input.context, input.companyId);
  const now = input.now ?? new Date();
  try {
    const executed = await executeIdempotent(db, {
      companyId: input.companyId,
      userId: input.context.actor.userId,
      operation: REPRINT_OPERATION,
      key: input.idempotencyKey,
      payload: idempotencyPayload(input),
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      now,
    }, async (tx) => {
      const note = await acquireDeliveryNotePrintLocks(
        tx,
        input,
        dependencies.lockObserver,
      );
      if (note.status !== "SHIPPED") throw new DeliveryNotePrintStateError(
        "只有已出貨銷貨單可以重印",
      );
      if (note.salesOrder.status !== "SHIPPED") {
        throw new DeliveryNoteSalesOrderStateError("銷貨單與訂單狀態不一致");
      }
      const version = note.printVersions[0];
      if (!version) throw new DeliveryNoteFormalPrintMissingError();
      if (
        version.byteSize !== version.pdfBytes.byteLength ||
        createHash("sha256").update(version.pdfBytes).digest("hex") !==
          version.contentHash
      ) {
        throw new DeliveryNotePdfRenderError(
          "DELIVERY_NOTE_PRINT_STORAGE_INVALID",
          "既有正式 PDF bytes 與 metadata 不一致",
        );
      }
      const event = await tx.deliveryNotePrintEvent.create({
        data: {
          companyId: note.companyId,
          deliveryNoteId: note.id,
          printVersionId: version.id,
          eventType: "REPRINT",
          occurredAt: now,
          actorUserId: input.context.actor.userId,
          sessionId: input.context.session.sessionId,
          requestId: input.context.requestId,
        },
      });
      const updatedNote = await tx.deliveryNote.update({
        where: { id: note.id },
        data: {
          reprintCount: { increment: 1 },
          updatedById: input.context.actor.userId,
        },
        include: { salesOrder: { select: { orderNumber: true } } },
      });
      await writeAudit(tx, {
        ...auditContext(input.context, input.companyId),
        entityType: "delivery_note",
        entityId: note.id,
        operation: REPRINT_OPERATION,
        beforeJson: { reprintCount: note.reprintCount },
        afterJson: { reprintCount: updatedNote.reprintCount },
        metadata: {
          deliveryNoteNumber: note.deliveryNoteNumber,
          printVersionId: version.id,
          printEventId: event.id,
          contentHash: version.contentHash,
          idempotencyOperation: REPRINT_OPERATION,
          idempotencyKeyHash: createHash("sha256")
            .update(input.idempotencyKey)
            .digest("hex"),
          correlationId: input.context.requestId,
        },
      });
      const value = resultFrom(updatedNote, version, event, false);
      return {
        value,
        responseStatus: 200,
        responseMetadata: { eventId: event.id },
        resultReference: event.id,
      };
    });
    if (!executed.replayed) return executed.value;
    const metadata =
      executed.responseMetadata &&
      typeof executed.responseMetadata === "object" &&
      !Array.isArray(executed.responseMetadata)
        ? executed.responseMetadata
        : null;
    const eventId =
      metadata && "eventId" in metadata && typeof metadata.eventId === "string"
        ? metadata.eventId
        : executed.resultReference ?? undefined;
    return loadPersistedResult(db, input, eventId);
  } catch (error) {
    return mapInfrastructureError(error);
  }
}
