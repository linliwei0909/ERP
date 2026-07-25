import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import { jsonResponse } from "@/lib/http";
import {
  periodAdjustmentRequestSchema,
  pricingApiError,
  requirePricingIdempotencyKey,
} from "@/lib/pricing/api";
import { adjustPriceAssignmentPeriod } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = periodAdjustmentRequestSchema.parse(await request.json());
    return jsonResponse(
      await adjustPriceAssignmentPeriod(prisma, {
        context,
        companyId: body.companyId,
        assignmentId: z.string().uuid().parse((await params).id),
        adjustment: body.adjustment,
        idempotencyKey: requirePricingIdempotencyKey(request),
      }),
    );
  } catch (error) {
    return pricingApiError(error);
  }
}
