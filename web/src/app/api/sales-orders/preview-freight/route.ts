import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  previewFreightRequestSchema,
  salesOrderApiError,
} from "@/lib/sales-orders/api";
import { previewSalesOrderFreight } from "@/lib/sales-orders/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = previewFreightRequestSchema.parse(await request.json());
    return jsonResponse({
      freight: await previewSalesOrderFreight(prisma, {
        context,
        companyId: context.selectedCompany.id,
        ...body,
      }),
    });
  } catch (error) {
    return salesOrderApiError(error);
  }
}
