import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  createDeliveryNoteRequestSchema,
  deliveryNoteApiError,
  deliveryNoteJsonResponse,
  deliveryNoteMutationResponse,
  deliveryNoteRequestId,
  deliveryNoteSalesOrderIdSchema,
  mapDeliveryNoteDetail,
  requireDeliveryNoteIdempotencyKey,
} from "@/lib/delivery-notes/api";
import {
  createDeliveryNoteFromOrder,
  getCurrentDeliveryNoteForOrder,
} from "@/lib/delivery-notes/service";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = deliveryNoteRequestId(request);
  try {
    const context = await getApiRequestContext(request);
    const deliveryNote = await getCurrentDeliveryNoteForOrder(prisma, {
      context,
      companyId: context.selectedCompany.id,
      salesOrderId: deliveryNoteSalesOrderIdSchema.parse((await params).id),
    });
    return deliveryNoteJsonResponse(
      {
        deliveryNote: deliveryNote
          ? mapDeliveryNoteDetail(deliveryNote)
          : null,
        correlationId: context.requestId,
      },
      context.requestId,
      200,
    );
  } catch (error) {
    return deliveryNoteApiError(error, requestId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = deliveryNoteRequestId(request);
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = createDeliveryNoteRequestSchema.parse(
      await request.json(),
    );
    const result = await createDeliveryNoteFromOrder(prisma, {
      context,
      companyId: context.selectedCompany.id,
      salesOrderId: deliveryNoteSalesOrderIdSchema.parse((await params).id),
      expectedRevisionNo: body.expectedRevisionNo,
      idempotencyKey: requireDeliveryNoteIdempotencyKey(request),
    });
    return deliveryNoteMutationResponse(
      result,
      context.requestId,
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    return deliveryNoteApiError(error, requestId);
  }
}
