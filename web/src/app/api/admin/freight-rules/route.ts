import type { NextRequest } from "next/server";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  freightApiError,
  freightRuleCreateRequestSchema,
  requireFreightIdempotencyKey,
} from "@/lib/freight/api";
import {
  createFreightRule,
  listFreightRules,
} from "@/lib/freight/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    await requireAdminWithAudit(prisma, context);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    return jsonResponse(
      await listFreightRules(prisma, {
        context,
        companyId,
        query: {
          customerId:
            request.nextUrl.searchParams.get("customerId") || undefined,
          deliveryLocationId:
            request.nextUrl.searchParams.get("deliveryLocationId") || undefined,
          status: request.nextUrl.searchParams.get("status") ?? "ALL",
          page: request.nextUrl.searchParams.get("page") ?? "1",
          pageSize: request.nextUrl.searchParams.get("pageSize") ?? "20",
        },
      }),
    );
  } catch (error) {
    return freightApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = freightRuleCreateRequestSchema.parse(await request.json());
    const result = await createFreightRule(prisma, {
      context,
      companyId: body.companyId,
      freightRule: body.freightRule,
      idempotencyKey: requireFreightIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return freightApiError(error);
  }
}
