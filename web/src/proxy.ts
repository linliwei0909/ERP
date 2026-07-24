import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { sessionCookieOptions } from "@/lib/auth/cookie";

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  response.cookies.set({
    ...sessionCookieOptions(),
    value: sessionCookie.value,
  });
  return response;
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
