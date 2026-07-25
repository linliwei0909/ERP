import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  customerApiError,
  customerCompanyRequestSchema,
  requireCustomerIdempotencyKey,
} from "@/lib/customers/api";
import { assignCustomerCompany } from "@/lib/customers/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const customerId = z.string().uuid().parse((await params).id);
    const body = customerCompanyRequestSchema.parse(await request.json());
    const result = await assignCustomerCompany(prisma, {
      context,
      companyId: body.companyId,
      customerId,
      relation: body.relation,
      idempotencyKey: requireCustomerIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return customerApiError(error);
  }
}
