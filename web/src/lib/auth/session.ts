import type { PrismaClient } from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";
import {
  assertCompanyAccess,
  chooseSelectedCompany,
  hasCompanyAccess,
} from "@/lib/auth/company-scope";
import {
  isSessionExpired,
  sessionIdleExpiresAt,
  shouldRefreshSessionActivity,
} from "@/lib/auth/session-policy";
import { hashSessionToken } from "@/lib/auth/session-token";
import { createRequestId } from "@/lib/correlation";
import { logger } from "@/lib/logger";

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
  requestId: string;
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
    requestId?: string;
  },
): Promise<RequestContext> {
  if (!token) {
    throw new SessionAuthenticationError();
  }

  const now = options.now ?? new Date();
  const requestId = createRequestId(options.requestId);
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
      const revokedReason =
        session.user.status === "ACTIVE"
          ? "idle_timeout"
          : "account_inactive";
      await db.$transaction(async (tx) => {
        const result = await tx.userSession.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokedReason,
          },
        });
        if (result.count > 0) {
          await writeAudit(tx, {
            ...systemAuditContext({
              actorUserId: session.user.id,
              sessionId: session.id,
              companyId: session.selectedCompanyId,
              requestId,
            }),
            entityType: "user_session",
            entityId: session.id,
            operation: "auth.session.revoked",
            reason: revokedReason,
          });
        }
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
    requestId,
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
  if (
    !hasCompanyAccess(
      context.authorizedCompanies.map((company) => company.id),
      companyId,
    )
  ) {
    await db.$transaction((tx) =>
      writeAudit(tx, {
        ...systemAuditContext({
          companyId: context.selectedCompany?.id,
          actorUserId: context.actor.userId,
          sessionId: context.session.sessionId,
          requestId: context.requestId,
        }),
        entityType: "user_session",
        entityId: context.session.sessionId,
        operation: "auth.company.denied",
        metadata: { requestedCompanyId: companyId },
      }),
    );
  }
  assertCompanyAccess(
    context.authorizedCompanies.map((company) => company.id),
    companyId,
  );

  await db.$transaction(async (tx) => {
    await tx.userSession.update({
      where: { id: context.session.sessionId },
      data: { selectedCompanyId: companyId },
    });
    await writeAudit(tx, {
      ...systemAuditContext({
        companyId,
        actorUserId: context.actor.userId,
        sessionId: context.session.sessionId,
        requestId: context.requestId,
      }),
      entityType: "user_session",
      entityId: context.session.sessionId,
      operation: "auth.company.switched",
      beforeJson: { companyId: context.selectedCompany?.id ?? null },
      afterJson: { companyId },
    });
  });
}

export async function revokeCurrentSession(
  db: PrismaClient,
  token: string | undefined,
  reason = "logout",
  now = new Date(),
  requestId = createRequestId(),
): Promise<void> {
  if (!token) {
    return;
  }

  await db.$transaction(async (tx) => {
    const session = await tx.userSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: { id: true, userId: true, selectedCompanyId: true, revokedAt: true },
    });
    if (!session || session.revokedAt) {
      return;
    }
    await tx.userSession.update({
      where: { id: session.id },
      data: {
        revokedAt: now,
        revokedReason: reason,
      },
    });
    await writeAudit(tx, {
      ...systemAuditContext({
        companyId: session.selectedCompanyId,
        actorUserId: session.userId,
        sessionId: session.id,
        requestId,
      }),
      entityType: "user_session",
      entityId: session.id,
      operation: "auth.session.revoked",
      reason,
    });
    logger.info("Session revoked", {
      event: "auth.session.revoked",
      actorUserId: session.userId,
      requestId,
      reason,
    });
  });
}
