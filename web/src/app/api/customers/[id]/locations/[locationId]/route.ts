import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  customerApiError,
  deliveryLocationRequestSchema,
  requireCustomerIdempotencyKey,
} from "@/lib/customers/api";
import { saveDeliveryLocation } from "@/lib/customers/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; locationId: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const route = await params;
    const customerId = z.string().uuid().parse(route.id);
    const locationId = z.string().uuid().parse(route.locationId);
    const body = deliveryLocationRequestSchema.parse(await request.json());
    const result = await saveDeliveryLocation(prisma, {
      context,
      companyId: body.companyId,
      customerId,
      locationId,
      location: body.value,
      idempotencyKey: requireCustomerIdempotencyKey(request),
    });
    return jsonResponse(result);
  } catch (error) {
    return customerApiError(error);
  }
}
