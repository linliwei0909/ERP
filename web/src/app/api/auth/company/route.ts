import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, formString } from "@/lib/auth/route-security";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { switchSessionCompany } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const formData = await request.formData();
    await switchSessionCompany(
      prisma,
      context,
      formString(formData, "companyId"),
    );
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch {
    return NextResponse.redirect(
      new URL("/?error=company_access_denied", request.url),
      303,
    );
  }
}
