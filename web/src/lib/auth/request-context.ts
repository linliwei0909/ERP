import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  getSessionContext,
  type RequestContext,
} from "@/lib/auth/session";
import { assertSelectedCompany } from "@/lib/auth/company-scope";

export type ProtectedRequestContext = RequestContext & {
  selectedCompany: NonNullable<RequestContext["selectedCompany"]>;
};

async function getProtectedRequestContext(
  sessionToken: string | undefined,
): Promise<ProtectedRequestContext> {
  const context = await getSessionContext(prisma, sessionToken, {
    activityThrottleMinutes:
      getServerEnv().SESSION_ACTIVITY_THROTTLE_MINUTES,
  });
  assertSelectedCompany(context.selectedCompany);
  return context as ProtectedRequestContext;
}

export async function getPageRequestContext(): Promise<ProtectedRequestContext> {
  const cookieStore = await cookies();
  return getProtectedRequestContext(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
}

export async function getApiRequestContext(
  request: NextRequest,
): Promise<ProtectedRequestContext> {
  return getProtectedRequestContext(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
}
