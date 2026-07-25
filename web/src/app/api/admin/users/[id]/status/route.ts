import { NextResponse, type NextRequest } from "next/server";
import { setUserStatus } from "@/lib/auth/admin-users";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin, formString } from "@/lib/auth/route-security";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    await requireAdminWithAudit(prisma, context);
    const formData = await request.formData();
    const status = formString(formData, "status");
    const reason = formString(formData, "reason");

    if ((status !== "ACTIVE" && status !== "INACTIVE") || !reason) {
      throw new Error("狀態或原因不正確");
    }

    await setUserStatus(prisma, context.actor.userId, {
      userId: (await params).id,
      status,
      reason,
      auditContext: {
        companyId: context.selectedCompany.id,
        sessionId: context.session.sessionId,
        requestId: context.requestId,
      },
    });

    return NextResponse.redirect(new URL("/admin/users", request.url), 303);
  } catch {
    return NextResponse.redirect(
      new URL("/admin/users?error=status_failed", request.url),
      303,
    );
  }
}
