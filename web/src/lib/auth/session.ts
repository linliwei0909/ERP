import type { PrismaClient } from "@/generated/prisma/client";
import { assertCompanyAccess, chooseSelectedCompany } from "@/lib/auth/company-scope";
import {
  isSessionExpired,
  sessionIdleExpiresAt,
  shouldRefreshSessionActivity,
} from "@/lib/auth/session-policy";
import { hashSessionToken } from "@/lib/auth/session-token";

export class SessionAuthenticationError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor() {
    super("需要登入");
  }
}

export type RequestContext = {
  actor: {
    userId: string;
    username: string;
  };
  session: {
    sessionId: string;
  };
  roleCodes: string[];
  authorizedCompanies: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  selectedCompany: {
    id: string;
    code: string;
    name: string;
  } | null;
};

export async function getSessionContext(
  db: PrismaClient,
  token: string | undefined,
  options: {
    activityThrottleMinutes: number;
    now?: Date;
  },
): Promise<RequestContext> {
  if (!token) {
    throw new SessionAuthenticationError();
  }

  const now = options.now ?? new Date();
  const session = await db.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          roleAssignments: {
            include: { role: true },
          },
          companyScopes: {
            include: { company: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    isSessionExpired(session.idleExpiresAt, now) ||
    session.user.status !== "ACTIVE"
  ) {
    if (session && !session.revokedAt) {
      await db.userSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason:
            session.user.status === "ACTIVE"
              ? "idle_timeout"
              : "account_inactive",
        },
      });
    }

    throw new SessionAuthenticationError();
  }

  const authorizedCompanies = session.user.companyScopes.map((scope) => ({
    id: scope.company.id,
    code: scope.company.code,
    name: scope.company.name,
  }));
  const authorizedCompanyIds = authorizedCompanies.map((company) => company.id);
  const selectedCompanyId = chooseSelectedCompany({
    authorizedCompanyIds,
    selectedCompanyId: session.selectedCompanyId,
    defaultCompanyId: session.user.defaultCompanyId,
  });
  const refreshActivity = shouldRefreshSessionActivity(
    session.lastActivityAt,
    now,
    options.activityThrottleMinutes,
  );

  if (refreshActivity || selectedCompanyId !== session.selectedCompanyId) {
    await db.userSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
        idleExpiresAt: { gt: now },
      },
      data: {
        ...(refreshActivity
          ? {
              lastActivityAt: now,
              idleExpiresAt: sessionIdleExpiresAt(now),
            }
          : {}),
        selectedCompanyId,
      },
    });
  }

  return {
    actor: {
      userId: session.user.id,
      username: session.user.username,
    },
    session: {
      sessionId: session.id,
    },
    roleCodes: session.user.roleAssignments
      .filter((assignment) => assignment.role.status === "ACTIVE")
      .map((assignment) => assignment.role.code),
    authorizedCompanies,
    selectedCompany:
      authorizedCompanies.find(
        (company) => company.id === selectedCompanyId,
      ) ?? null,
  };
}

export async function switchSessionCompany(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
): Promise<void> {
  assertCompanyAccess(
    context.authorizedCompanies.map((company) => company.id),
    companyId,
  );

  await db.userSession.update({
    where: { id: context.session.sessionId },
    data: { selectedCompanyId: companyId },
  });
}

export async function revokeCurrentSession(
  db: PrismaClient,
  token: string | undefined,
  reason = "logout",
  now = new Date(),
): Promise<void> {
  if (!token) {
    return;
  }

  await db.userSession.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revokedReason: reason,
    },
  });
}
