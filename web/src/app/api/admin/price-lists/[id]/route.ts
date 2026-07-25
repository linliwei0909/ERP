import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import { jsonResponse } from "@/lib/http";
import {
  priceListUpdateRequestSchema,
  pricingApiError,
  requirePricingIdempotencyKey,
} from "@/lib/pricing/api";
import { getPriceList, updatePriceList } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiRequestContext(request);
    await requireAdminWithAudit(prisma, context);
    const companyId = request.nextUrl.searchParams.get("companyId") ?? context.selectedCompany.id;
    return jsonResponse({
      priceList: await getPriceList(prisma, {
        context,
        companyId,
        priceListId: z.string().uuid().parse((await params).id),
      }),
    });
  } catch (error) {
    return pricingApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = priceListUpdateRequestSchema.parse(await request.json());
    return jsonResponse(
      await updatePriceList(prisma, {
        context,
        companyId: body.companyId,
        priceListId: z.string().uuid().parse((await params).id),
        priceList: body.priceList,
        idempotencyKey: requirePricingIdempotencyKey(request),
      }),
    );
  } catch (error) {
    return pricingApiError(error);
  }
}
