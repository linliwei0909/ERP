import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  freightApiError,
  freightRuleUpdateRequestSchema,
  requireFreightIdempotencyKey,
} from "@/lib/freight/api";
import {
  getFreightRule,
  updateFreightRule,
} from "@/lib/freight/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getApiRequestContext(request);
    await requireAdminWithAudit(prisma, context);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    return jsonResponse({
      freightRule: await getFreightRule(prisma, {
        context,
        companyId,
        freightRuleId: z.string().uuid().parse((await params).id),
      }),
    });
  } catch (error) {
    return freightApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = freightRuleUpdateRequestSchema.parse(await request.json());
    return jsonResponse(
      await updateFreightRule(prisma, {
        context,
        companyId: body.companyId,
        freightRuleId: z.string().uuid().parse((await params).id),
        freightRule: body.freightRule,
        idempotencyKey: requireFreightIdempotencyKey(request),
      }),
    );
  } catch (error) {
    return freightApiError(error);
  }
}
