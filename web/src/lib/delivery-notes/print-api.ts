import { z } from "zod";
import type { RequestContext } from "@/lib/auth/session";
import type { DeliveryNotePrintResult } from "@/lib/delivery-notes/formal-print";
import { deliveryNoteJsonResponse } from "@/lib/delivery-notes/api";

export const deliveryNotePrintRequestSchema = z.object({}).strict();

export async function parseDeliveryNotePrintRequest(
  request: Request,
): Promise<Record<string, never>> {
  const text = await request.text();
  return deliveryNotePrintRequestSchema.parse(
    text.trim() ? JSON.parse(text) : {},
  );
}

export type DeliveryNotePrintResponseDto = {
  deliveryNote: {
    id: string;
    number: string;
    status: "SHIPPED";
    actualDeliveryDate: string;
    firstPrintedAt: string;
    firstPrintedBy: {
      id: string;
      username?: string;
    };
    reprintCount: number;
  };
  salesOrder: {
    id: string;
    number: string;
    status: "SHIPPED";
  };
  printVersion: {
    id: string;
    documentVersion: number;
    rendererVersion: string;
    templateVersion: string;
    fontVersion: string;
    snapshotVersion: string;
    filename: string;
    byteSize: number;
    sha256: string;
    mimeType: string;
  };
  printEvent: {
    id: string;
    type: "FORMAL_PRINT" | "REPRINT";
  };
  downloadUrl: string;
  replayed: boolean;
  correlationId: string;
};

export function deliveryNotePrintResponse(
  result: DeliveryNotePrintResult,
  context: RequestContext,
  eventType: "FORMAL_PRINT" | "REPRINT",
): Response {
  const body: DeliveryNotePrintResponseDto = {
    deliveryNote: {
      id: result.deliveryNoteId,
      number: result.deliveryNoteNumber,
      status: result.deliveryNoteStatus,
      actualDeliveryDate: result.actualDeliveryDate,
      firstPrintedAt: result.firstPrintedAt,
      firstPrintedBy: {
        id: result.firstPrintedById,
        ...(eventType === "FORMAL_PRINT"
          ? { username: context.actor.username }
          : {}),
      },
      reprintCount: result.reprintCount,
    },
    salesOrder: {
      id: result.salesOrderId,
      number: result.salesOrderNumber,
      status: result.salesOrderStatus,
    },
    printVersion: {
      id: result.printVersionId,
      documentVersion: result.documentVersion,
      rendererVersion: result.rendererVersion,
      templateVersion: result.templateVersion,
      fontVersion: result.fontVersion,
      snapshotVersion: result.snapshotVersion,
      filename: result.filename,
      byteSize: result.byteSize,
      sha256: result.contentHash,
      mimeType: result.mimeType,
    },
    printEvent: {
      id: result.printEventId,
      type: eventType,
    },
    downloadUrl: `/api/delivery-notes/${result.deliveryNoteId}/pdf`,
    replayed: result.replayed,
    correlationId: context.requestId,
  };
  return deliveryNoteJsonResponse(body, context.requestId, 200);
}
