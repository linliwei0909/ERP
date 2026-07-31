import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { cache } from "react";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  getSessionContext,
  type RequestContext,
} from "@/lib/auth/session";
import { assertSelectedCompany } from "@/lib/auth/company-scope";
import { REQUEST_ID_HEADER, createRequestId } from "@/lib/correlation";

export type ProtectedRequestContext = RequestContext & {
  selectedCompany: NonNullable<RequestContext["selectedCompany"]>;
};

async function getProtectedRequestContext(
  sessionToken: string | undefined,
  requestId?: string | null,
): Promise<ProtectedRequestContext> {
  const context = await getSessionContext(prisma, sessionToken, {
    activityThrottleMinutes:
      getServerEnv().SESSION_ACTIVITY_THROTTLE_MINUTES,
    requestId: createRequestId(requestId),
  });
  assertSelectedCompany(context.selectedCompany);
  return context as ProtectedRequestContext;
}

export const getPageSessionContext = cache(async (): Promise<RequestContext> => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return getSessionContext(
    prisma,
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
    {
      activityThrottleMinutes:
        getServerEnv().SESSION_ACTIVITY_THROTTLE_MINUTES,
      requestId: createRequestId(headerStore.get(REQUEST_ID_HEADER)),
    },
  );
});

export async function getPageRequestContext(): Promise<ProtectedRequestContext> {
  const context = await getPageSessionContext();
  assertSelectedCompany(context.selectedCompany);
  return context as ProtectedRequestContext;
}

export async function getApiRequestContext(
  request: NextRequest,
): Promise<ProtectedRequestContext> {
  return getProtectedRequestContext(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    request.headers.get(REQUEST_ID_HEADER),
  );
}
