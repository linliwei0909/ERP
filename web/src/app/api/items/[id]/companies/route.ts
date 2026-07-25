import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  itemApiError,
  itemCompanyRequestSchema,
  requireItemIdempotencyKey,
} from "@/lib/items/api";
import { assignItemCompany } from "@/lib/items/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const itemId = z.string().uuid().parse((await params).id);
    const body = itemCompanyRequestSchema.parse(await request.json());
    const result = await assignItemCompany(prisma, {
      context,
      companyId: body.companyId,
      itemId,
      relation: body.relation,
      idempotencyKey: requireItemIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return itemApiError(error);
  }
}
