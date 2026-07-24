import { NextResponse, type NextRequest } from "next/server";
import { revokeAllUserSessions } from "@/lib/auth/admin-users";
import { requireAdmin } from "@/lib/auth/authorization";
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
    requireAdmin(context);
    await revokeAllUserSessions(prisma, context.actor.userId, {
      userId: (await params).id,
      reason: formString(await request.formData(), "reason"),
    });

    return NextResponse.redirect(new URL("/admin/users", request.url), 303);
  } catch {
    return NextResponse.redirect(
      new URL("/admin/users?error=revoke_failed", request.url),
      303,
    );
  }
}
