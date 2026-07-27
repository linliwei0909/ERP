import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import {
  deliveryNoteApiError,
  deliveryNoteListQuerySchema,
  deliveryNoteListResponse,
  deliveryNoteRequestId,
} from "@/lib/delivery-notes/api";
import { listDeliveryNotes } from "@/lib/delivery-notes/service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const requestId = deliveryNoteRequestId(request);
  try {
    const context = await getApiRequestContext(request);
    const filters = deliveryNoteListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const result = await listDeliveryNotes(prisma, {
      context,
      companyId: context.selectedCompany.id,
      filters,
    });
    return deliveryNoteListResponse(result, context.requestId);
  } catch (error) {
    return deliveryNoteApiError(error, requestId);
  }
}
