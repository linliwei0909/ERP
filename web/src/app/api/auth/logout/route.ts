import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { sessionCookieOptions } from "@/lib/auth/cookie";
import { assertSameOrigin } from "@/lib/auth/route-security";
import { revokeCurrentSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  assertSameOrigin(request);
  await revokeCurrentSession(
    prisma,
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set({
    ...sessionCookieOptions(),
    value: "",
    maxAge: 0,
  });
  return response;
}
