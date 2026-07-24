import { NextResponse, type NextRequest } from "next/server";
import { createManagedUser } from "@/lib/auth/admin-users";
import { requireAdmin } from "@/lib/auth/authorization";
import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { getApiRequestContext } from "@/lib/auth/request-context";
import {
  assertSameOrigin,
  formRawString,
  formString,
  formStrings,
} from "@/lib/auth/route-security";
import { prisma } from "@/lib/prisma";

const validRoleCodes = new Set<string>(Object.values(ROLE_CODES));

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    requireAdmin(context);
    const formData = await request.formData();
    const roleCodes = formStrings(formData, "roleCodes").filter((role) =>
      validRoleCodes.has(role),
    ) as RoleCode[];
    const defaultCompanyId =
      formString(formData, "defaultCompanyId") || null;

    await createManagedUser(prisma, context.actor.userId, {
      username: formString(formData, "username"),
      password: formRawString(formData, "password"),
      roleCodes,
      companyIds: formStrings(formData, "companyIds"),
      defaultCompanyId,
    });

    return NextResponse.redirect(new URL("/admin/users", request.url), 303);
  } catch {
    return NextResponse.redirect(
      new URL("/admin/users?error=create_failed", request.url),
      303,
    );
  }
}
