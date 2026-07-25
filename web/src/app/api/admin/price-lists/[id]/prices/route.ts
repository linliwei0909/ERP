import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import { jsonResponse } from "@/lib/http";
import {
  itemPriceCreateRequestSchema,
  pricingApiError,
  requirePricingIdempotencyKey,
} from "@/lib/pricing/api";
import { createItemPriceVersion } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = itemPriceCreateRequestSchema.parse(await request.json());
    const result = await createItemPriceVersion(prisma, {
      context,
      companyId: body.companyId,
      priceListId: z.string().uuid().parse((await params).id),
      price: body.price,
      idempotencyKey: requirePricingIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return pricingApiError(error);
  }
}
