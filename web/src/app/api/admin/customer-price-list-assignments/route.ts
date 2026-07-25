import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import { jsonResponse } from "@/lib/http";
import {
  assignmentCreateRequestSchema,
  pricingApiError,
  requirePricingIdempotencyKey,
} from "@/lib/pricing/api";
import { createPriceAssignment } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = assignmentCreateRequestSchema.parse(await request.json());
    const result = await createPriceAssignment(prisma, {
      context,
      companyId: body.companyId,
      assignment: body.assignment,
      idempotencyKey: requirePricingIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return pricingApiError(error);
  }
}
