import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  deliveryNoteApiError,
  deliveryNoteIdSchema,
  deliveryNoteRequestId,
  requireDeliveryNoteIdempotencyKey,
} from "@/lib/delivery-notes/api";
import { formalPrintDeliveryNote } from "@/lib/delivery-notes/formal-print";
import {
  deliveryNotePrintResponse,
  parseDeliveryNotePrintRequest,
} from "@/lib/delivery-notes/print-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = deliveryNoteRequestId(request);
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    await parseDeliveryNotePrintRequest(request);
    const result = await formalPrintDeliveryNote(prisma, {
      context,
      companyId: context.selectedCompany.id,
      deliveryNoteId: deliveryNoteIdSchema.parse((await params).id),
      idempotencyKey: requireDeliveryNoteIdempotencyKey(request),
    });
    return deliveryNotePrintResponse(result, context, "FORMAL_PRINT");
  } catch (error) {
    return deliveryNoteApiError(error, requestId);
  }
}
