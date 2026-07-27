import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  requireSalesOrderIdempotencyKey,
  salesOrderApiError,
} from "@/lib/sales-orders/api";
import { startSalesOrderRevision } from "@/lib/sales-orders/service";
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
    const result = await startSalesOrderRevision(prisma, {
      context,
      companyId: context.selectedCompany.id,
      orderId: salesOrderIdSchema.parse((await params).id),
      idempotencyKey: requireSalesOrderIdempotencyKey(request),
    });
    return jsonResponse(result);
  } catch (error) {
    return salesOrderApiError(error);
  }
}
