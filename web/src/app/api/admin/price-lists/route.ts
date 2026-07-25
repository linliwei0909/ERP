import type { NextRequest } from "next/server";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import { jsonResponse } from "@/lib/http";
import {
  priceListCreateRequestSchema,
  pricingApiError,
  requirePricingIdempotencyKey,
} from "@/lib/pricing/api";
import { createPriceList, listPriceLists } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    await requireAdminWithAudit(prisma, context);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    return jsonResponse(
      await listPriceLists(prisma, {
        context,
        companyId,
        query: {
          search: request.nextUrl.searchParams.get("search") ?? "",
          status: request.nextUrl.searchParams.get("status") ?? "ACTIVE",
          page: request.nextUrl.searchParams.get("page") ?? "1",
          pageSize: request.nextUrl.searchParams.get("pageSize") ?? "20",
        },
      }),
    );
  } catch (error) {
    return pricingApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = priceListCreateRequestSchema.parse(await request.json());
    const result = await createPriceList(prisma, {
      context,
      companyId: body.companyId,
      priceList: body.priceList,
      idempotencyKey: requirePricingIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return pricingApiError(error);
  }
}
