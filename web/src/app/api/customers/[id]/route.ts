import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  customerApiError,
  customerUpdateRequestSchema,
  requireCustomerIdempotencyKey,
} from "@/lib/customers/api";
import { getCustomer, updateCustomer } from "@/lib/customers/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getApiRequestContext(request);
    const customerId = z.string().uuid().parse((await params).id);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    const customer = await getCustomer(prisma, {
      context,
      companyId,
      customerId,
      includeInactive:
        request.nextUrl.searchParams.get("includeInactive") === "true",
    });
    return jsonResponse({ customer });
  } catch (error) {
    return customerApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const customerId = z.string().uuid().parse((await params).id);
    const body = customerUpdateRequestSchema.parse(await request.json());
    const result = await updateCustomer(prisma, {
      context,
      companyId: body.companyId,
      customerId,
      customer: body.customer,
      idempotencyKey: requireCustomerIdempotencyKey(request),
    });
    return jsonResponse(result);
  } catch (error) {
    return customerApiError(error);
  }
}
