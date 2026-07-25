import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  itemApiError,
  itemCreateRequestSchema,
  requireItemIdempotencyKey,
} from "@/lib/items/api";
import { createItem, listItems } from "@/lib/items/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    const result = await listItems(prisma, {
      context,
      companyId,
      query: {
        search: request.nextUrl.searchParams.get("search") ?? "",
        status: request.nextUrl.searchParams.get("status") ?? "ACTIVE",
        itemType: request.nextUrl.searchParams.get("itemType") ?? "ALL",
        availability:
          request.nextUrl.searchParams.get("availability") ?? "SALEABLE",
        page: request.nextUrl.searchParams.get("page") ?? "1",
        pageSize: request.nextUrl.searchParams.get("pageSize") ?? "20",
      },
    });
    return jsonResponse(result);
  } catch (error) {
    return itemApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = itemCreateRequestSchema.parse(await request.json());
    const result = await createItem(prisma, {
      context,
      companyId: body.companyId,
      item: body.item,
      companyRelation: body.companyRelation,
      idempotencyKey: requireItemIdempotencyKey(request),
    });
    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return itemApiError(error);
  }
}
