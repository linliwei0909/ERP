import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  adminVoidDeliveryNoteRequestSchema,
  deliveryNoteApiError,
  deliveryNoteIdSchema,
  deliveryNoteMutationResponse,
  deliveryNoteRequestId,
  requireDeliveryNoteIdempotencyKey,
} from "@/lib/delivery-notes/api";
import { adminVoidDeliveryNote } from "@/lib/delivery-notes/service";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = deliveryNoteRequestId(request);
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = adminVoidDeliveryNoteRequestSchema.parse(
      await request.json(),
    );
    const result = await adminVoidDeliveryNote(prisma, {
      context,
      companyId: context.selectedCompany.id,
      deliveryNoteId: deliveryNoteIdSchema.parse((await params).id),
      voidReason: body.reason,
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
