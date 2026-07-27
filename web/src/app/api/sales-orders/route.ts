import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  createSalesOrderRequestSchema,
  requireSalesOrderIdempotencyKey,
  salesOrderApiError,
} from "@/lib/sales-orders/api";
import {
  createSalesOrderDraft,
  listSalesOrders,
} from "@/lib/sales-orders/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    const result = await listSalesOrders(prisma, {
      context,
      companyId: context.selectedCompany.id,
      query: Object.fromEntries(request.nextUrl.searchParams),
    });
    return jsonResponse(result);
  } catch (error) {
    return salesOrderApiError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = createSalesOrderRequestSchema.parse(await request.json());
    const result = await createSalesOrderDraft(prisma, {
      context,
      companyId: context.selectedCompany.id,
      draft: body.draft,
      idempotencyKey: requireSalesOrderIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return salesOrderApiError(error);
  }
}
