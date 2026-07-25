import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  customerApiError,
  customerContactRequestSchema,
  requireCustomerIdempotencyKey,
} from "@/lib/customers/api";
import { saveCustomerContact } from "@/lib/customers/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const route = await params;
    const customerId = z.string().uuid().parse(route.id);
    const contactId = z.string().uuid().parse(route.contactId);
    const body = customerContactRequestSchema.parse(await request.json());
    const result = await saveCustomerContact(prisma, {
      context,
      companyId: body.companyId,
      customerId,
      contactId,
      contact: body.value,
      idempotencyKey: requireCustomerIdempotencyKey(request),
    });
    return jsonResponse(result);
  } catch (error) {
    return customerApiError(error);
  }
}
