import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import {
  deliveryNoteApiError,
  deliveryNoteDetailResponse,
  deliveryNoteIdSchema,
  deliveryNoteRequestId,
} from "@/lib/delivery-notes/api";
import { getDeliveryNote } from "@/lib/delivery-notes/service";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = deliveryNoteRequestId(request);
  try {
    const context = await getApiRequestContext(request);
    const deliveryNote = await getDeliveryNote(prisma, {
      context,
      companyId: context.selectedCompany.id,
      deliveryNoteId: deliveryNoteIdSchema.parse((await params).id),
    });
    return deliveryNoteDetailResponse(
      deliveryNote,
      context.requestId,
    );
  } catch (error) {
    return deliveryNoteApiError(error, requestId);
  }
}
