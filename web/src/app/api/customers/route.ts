import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  customerApiError,
  customerCreateRequestSchema,
  requireCustomerIdempotencyKey,
} from "@/lib/customers/api";
import { createCustomer, listCustomers } from "@/lib/customers/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    const result = await listCustomers(prisma, {
      context,
      companyId,
      query: {
        search: request.nextUrl.searchParams.get("search") ?? "",
        status: request.nextUrl.searchParams.get("status") ?? "ACTIVE",
        page: request.nextUrl.searchParams.get("page") ?? "1",
        pageSize: request.nextUrl.searchParams.get("pageSize") ?? "20",
      },
    });
    return jsonResponse(result);
  } catch (error) {
    return customerApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = customerCreateRequestSchema.parse(await request.json());
    const result = await createCustomer(prisma, {
      context,
      companyId: body.companyId,
      customer: body.customer,
      customerCode: body.customerCode,
      idempotencyKey: requireCustomerIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return customerApiError(error);
  }
}
