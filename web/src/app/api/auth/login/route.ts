import { NextResponse, type NextRequest } from "next/server";
import { authenticateCredentials } from "@/lib/auth/authentication";
import { sessionCookieOptions } from "@/lib/auth/cookie";
import {
  assertSameOrigin,
  formRawString,
  formString,
} from "@/lib/auth/route-security";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { REQUEST_ID_HEADER } from "@/lib/correlation";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const formData = await request.formData();
    const env = getServerEnv();
    const result = await authenticateCredentials(
      prisma,
      {
        username: formString(formData, "username"),
        password: formRawString(formData, "password"),
        clientMetadata: {
          userAgent: request.headers.get("user-agent") ?? "unknown",
        },
        requestId: request.headers.get(REQUEST_ID_HEADER) ?? undefined,
      },
      {
        maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
        lockMinutes: env.AUTH_LOCK_MINUTES,
      },
    );

    if (!result.ok) {
      return NextResponse.redirect(
        new URL("/login?error=invalid", request.url),
        303,
      );
    }

    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.cookies.set({
      ...sessionCookieOptions(),
      value: result.token,
    });
    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=invalid", request.url),
      303,
    );
  }
}
