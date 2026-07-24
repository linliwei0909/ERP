import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { chooseSelectedCompany } from "@/lib/auth/company-scope";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sessionIdleExpiresAt } from "@/lib/auth/session-policy";
import {
  createSessionToken,
  hashSessionToken,
} from "@/lib/auth/session-token";
import { isAccountTemporarilyLocked } from "@/lib/auth/lockout";
import { normalizeUsername } from "@/lib/auth/username";
import { logger } from "@/lib/logger";

export type AuthenticationConfig = {
  maxFailedAttempts: number;
  lockMinutes: number;
};

export type AuthenticationResult =
  | {
      ok: true;
      token: string;
      sessionId: string;
    }
  | {
      ok: false;
      code: "INVALID_CREDENTIALS";
    };

const dummyPasswordHash = hashPassword(
  randomBytes(24).toString("base64url"),
);

export async function authenticateCredentials(
  db: PrismaClient,
  input: {
    username: string;
    password: string;
    clientMetadata?: Record<string, string>;
  },
  config: AuthenticationConfig,
  now = new Date(),
): Promise<AuthenticationResult> {
  const normalizedUsername = normalizeUsername(input.username);
  const user = await db.user.findUnique({
    where: { normalizedUsername },
    include: {
      companyScopes: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    await verifyPassword(input.password, await dummyPasswordHash);
    logger.warn("Authentication failed", {
      event: "auth.login.failed",
      reason: "invalid_credentials",
    });
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (
    user.status !== "ACTIVE" ||
    isAccountTemporarilyLocked(user.lockedUntil, now)
  ) {
    logger.warn("Authentication failed", {
      event: "auth.login.failed",
      userId: user.id,
      reason: user.status !== "ACTIVE" ? "inactive" : "temporarily_locked",
    });
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  if (!passwordMatches) {
    const lockSeconds = config.lockMinutes * 60;
    await db.$executeRaw`
      UPDATE "users"
      SET
        "failed_login_attempts" = "failed_login_attempts" + 1,
        "locked_until" = CASE
          WHEN "failed_login_attempts" + 1 >= ${config.maxFailedAttempts}
          THEN ${now}::timestamptz + (${lockSeconds} * INTERVAL '1 second')
          ELSE NULL
        END,
        "updated_at" = ${now}
      WHERE "id" = ${user.id}::uuid
    `;

    logger.warn("Authentication failed", {
      event: "auth.login.failed",
      userId: user.id,
      reason: "invalid_credentials",
    });
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const authorizedCompanyIds = user.companyScopes.map(
    (scope) => scope.companyId,
  );
  const selectedCompanyId = chooseSelectedCompany({
    authorizedCompanyIds,
    defaultCompanyId: user.defaultCompanyId,
  });

  const session = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastActiveAt: now,
      },
    });

    return tx.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
        lastActivityAt: now,
        idleExpiresAt: sessionIdleExpiresAt(now),
        selectedCompanyId,
        clientMetadata: input.clientMetadata,
      },
    });
  });

  logger.info("Authentication succeeded", {
    event: "auth.login.succeeded",
    userId: user.id,
    sessionId: session.id,
  });

  return {
    ok: true,
    token,
    sessionId: session.id,
  };
}
