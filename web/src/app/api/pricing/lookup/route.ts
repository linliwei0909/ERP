import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { jsonResponse } from "@/lib/http";
import { pricingApiError } from "@/lib/pricing/api";
import { getEffectivePrice } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    const companyId =
      request.nextUrl.searchParams.get("companyId") ??
      context.selectedCompany.id;
    const result = await getEffectivePrice(prisma, {
      context,
      companyId,
      customerId: request.nextUrl.searchParams.get("customerId") ?? "",
      itemId: request.nextUrl.searchParams.get("itemId") ?? "",
      effectiveDate:
        request.nextUrl.searchParams.get("effectiveDate") ?? "",
    });
    return jsonResponse(result);
  } catch (error) {
    return pricingApiError(error);
  }
}
