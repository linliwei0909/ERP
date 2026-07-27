import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  deliveryNoteApiError,
  deliveryNoteMutationResponse,
  deliveryNoteRequestId,
  deliveryNoteSalesOrderIdSchema,
  rebuildDeliveryNoteRequestSchema,
  requireDeliveryNoteIdempotencyKey,
} from "@/lib/delivery-notes/api";
import { rebuildDeliveryNoteForOrder } from "@/lib/delivery-notes/service";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = deliveryNoteRequestId(request);
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = rebuildDeliveryNoteRequestSchema.parse(
      await request.json(),
    );
    const result = await rebuildDeliveryNoteForOrder(prisma, {
      context,
      companyId: context.selectedCompany.id,
      salesOrderId: deliveryNoteSalesOrderIdSchema.parse((await params).id),
      expectedRevisionNo: body.expectedRevisionNo,
      reason: body.reason,
      idempotencyKey: requireDeliveryNoteIdempotencyKey(request),
    });
    return deliveryNoteMutationResponse(
      result,
      context.requestId,
      200,
    );
  } catch (error) {
    return deliveryNoteApiError(error, requestId);
  }
}
