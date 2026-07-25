import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { freightApiError } from "@/lib/freight/api";
import { quoteFreight } from "@/lib/freight/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    return jsonResponse(
      await quoteFreight(prisma, {
        context,
        companyId,
        customerId: request.nextUrl.searchParams.get("customerId") ?? "",
        deliveryLocationId:
          request.nextUrl.searchParams.get("deliveryLocationId") ?? "",
        effectiveDate:
          request.nextUrl.searchParams.get("effectiveDate") ?? "",
        quantity: request.nextUrl.searchParams.get("quantity") ?? "",
      }),
    );
  } catch (error) {
    return freightApiError(error);
  }
}
