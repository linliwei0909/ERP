import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  requireSalesOrderIdempotencyKey,
  salesOrderApiError,
  voidSalesOrderSchema,
} from "@/lib/sales-orders/api";
import { voidSalesOrder } from "@/lib/sales-orders/service";
import { salesOrderIdSchema } from "@/lib/sales-orders/validation";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = voidSalesOrderSchema.parse(await request.json());
    const result = await voidSalesOrder(prisma, {
      context,
      companyId: context.selectedCompany.id,
      orderId: salesOrderIdSchema.parse((await params).id),
      reason: body.reason,
      idempotencyKey: requireSalesOrderIdempotencyKey(request),
    });
    return jsonResponse(result);
  } catch (error) {
    return salesOrderApiError(error);
  }
}
