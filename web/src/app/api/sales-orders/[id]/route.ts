import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  requireSalesOrderIdempotencyKey,
  salesOrderApiError,
  updateSalesOrderRequestSchema,
} from "@/lib/sales-orders/api";
import {
  getSalesOrder,
  updateSalesOrderDraft,
} from "@/lib/sales-orders/service";
import { salesOrderIdSchema } from "@/lib/sales-orders/validation";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getApiRequestContext(request);
    const orderId = salesOrderIdSchema.parse((await params).id);
    const order = await getSalesOrder(prisma, {
      context,
      companyId: context.selectedCompany.id,
      orderId,
    });
    return jsonResponse({ order });
  } catch (error) {
    return salesOrderApiError(error);
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const orderId = salesOrderIdSchema.parse((await params).id);
    const body = updateSalesOrderRequestSchema.parse(await request.json());
    const result = await updateSalesOrderDraft(prisma, {
      context,
      companyId: context.selectedCompany.id,
      orderId,
      draft: body.draft,
      idempotencyKey: requireSalesOrderIdempotencyKey(request),
    });
    return jsonResponse(result);
  } catch (error) {
    return salesOrderApiError(error);
  }
}
