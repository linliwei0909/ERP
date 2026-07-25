import { NextResponse, type NextRequest } from "next/server";
import { assignUserAccess } from "@/lib/auth/admin-users";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { getApiRequestContext } from "@/lib/auth/request-context";
import {
  assertSameOrigin,
  formString,
  formStrings,
} from "@/lib/auth/route-security";
import { prisma } from "@/lib/prisma";

const validRoleCodes = new Set<string>(Object.values(ROLE_CODES));

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    await requireAdminWithAudit(prisma, context);
    const formData = await request.formData();
    const roleCodes = formStrings(formData, "roleCodes").filter((role) =>
      validRoleCodes.has(role),
    ) as RoleCode[];

    await assignUserAccess(prisma, context.actor.userId, {
      userId: (await params).id,
      roleCodes,
      companyIds: formStrings(formData, "companyIds"),
      defaultCompanyId:
        formString(formData, "defaultCompanyId") || null,
      reason: formString(formData, "reason"),
      auditContext: {
        companyId: context.selectedCompany.id,
        sessionId: context.session.sessionId,
        requestId: context.requestId,
      },
    });

    return NextResponse.redirect(new URL("/admin/users", request.url), 303);
  } catch {
    return NextResponse.redirect(
      new URL("/admin/users?error=access_failed", request.url),
      303,
    );
  }
}
