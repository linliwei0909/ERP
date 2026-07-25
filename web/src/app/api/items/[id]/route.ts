import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  itemApiError,
  itemUpdateRequestSchema,
  requireItemIdempotencyKey,
} from "@/lib/items/api";
import { getItem, updateItem } from "@/lib/items/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getApiRequestContext(request);
    const itemId = z.string().uuid().parse((await params).id);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    const item = await getItem(prisma, {
      context,
      companyId,
      itemId,
      includeInactive:
        request.nextUrl.searchParams.get("includeInactive") === "true",
    });
    return jsonResponse({ item });
  } catch (error) {
    return itemApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const itemId = z.string().uuid().parse((await params).id);
    const body = itemUpdateRequestSchema.parse(await request.json());
    const result = await updateItem(prisma, {
      context,
      companyId: body.companyId,
      itemId,
      item: body.item,
      idempotencyKey: requireItemIdempotencyKey(request),
    });
    return jsonResponse(result);
  } catch (error) {
    return itemApiError(error);
  }
}
