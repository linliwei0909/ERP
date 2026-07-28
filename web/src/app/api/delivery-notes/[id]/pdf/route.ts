import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import {
  deliveryNoteApiError,
  deliveryNoteIdSchema,
  deliveryNoteRequestId,
} from "@/lib/delivery-notes/api";
import {
  deliveryNotePdfResponse,
  getDeliveryNotePdfDownload,
} from "@/lib/delivery-notes/print-download";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = deliveryNoteRequestId(request);
  try {
    const context = await getApiRequestContext(request);
    const download = await getDeliveryNotePdfDownload(prisma, {
      context,
      companyId: context.selectedCompany.id,
      deliveryNoteId: deliveryNoteIdSchema.parse((await params).id),
    });
    return deliveryNotePdfResponse(download, context.requestId);
  } catch (error) {
    return deliveryNoteApiError(error, requestId);
  }
}
