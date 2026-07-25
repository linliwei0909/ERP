import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { sessionCookieOptions } from "@/lib/auth/cookie";
import { REQUEST_ID_HEADER, createRequestId } from "@/lib/correlation";

export function proxy(request: NextRequest) {
  const requestId = createRequestId(request.headers.get(REQUEST_ID_HEADER));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const isProtected =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/admin");

  if (isProtected && !sessionCookie?.value) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (isProtected && sessionCookie?.value) {
    response.cookies.set({
      ...sessionCookieOptions(),
      value: sessionCookie.value,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
