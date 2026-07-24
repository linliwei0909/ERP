import type { PrismaClient } from "@/generated/prisma/client";
import { auditData } from "@/lib/audit";
import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { normalizeUsername } from "@/lib/auth/username";

const allowedRoleCodes = new Set<string>(Object.values(ROLE_CODES));

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validateDefaultCompany(
  companyIds: readonly string[],
  defaultCompanyId: string | null,
) {
  if (defaultCompanyId && !companyIds.includes(defaultCompanyId)) {
    throw new Error("預設公司必須包含在使用者的公司授權中");
  }
}

export async function createManagedUser(
  db: PrismaClient,
  actorUserId: string,
  input: {
    username: string;
    password: string;
    roleCodes: RoleCode[];
    companyIds: string[];
    defaultCompanyId: string | null;
  },
) {
  const roleCodes = unique(input.roleCodes);
  const companyIds = unique(input.companyIds);
  validateDefaultCompany(companyIds, input.defaultCompanyId);

  if (
    roleCodes.length === 0 ||
    roleCodes.some((role) => !allowedRoleCodes.has(role))
  ) {
    throw new Error("至少需要一個有效角色");
  }

  const normalizedUsername = normalizeUsername(input.username);
  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    const roles = await tx.role.findMany({
      where: {
        code: { in: roleCodes },
        status: "ACTIVE",
      },
    });
    const companies = await tx.company.findMany({
      where: {
        id: { in: companyIds },
        status: "ACTIVE",
      },
    });

    if (roles.length !== roleCodes.length) {
      throw new Error("角色不存在或已停用");
    }

    if (companies.length !== companyIds.length) {
      throw new Error("公司不存在或已停用");
    }

    const user = await tx.user.create({
      data: {
        username: input.username.trim(),
        normalizedUsername,
        passwordHash,
        defaultCompanyId: null,
      },
    });

    await tx.userRole.createMany({
      data: roles.map((role) => ({
        userId: user.id,
        roleId: role.id,
      })),
    });
    await tx.userCompanyScope.createMany({
      data: companies.map((company) => ({
        userId: user.id,
        companyId: company.id,
      })),
    });
    await tx.user.update({
      where: { id: user.id },
      data: { defaultCompanyId: input.defaultCompanyId },
    });
    await tx.auditLog.create({
      data: auditData({
        companyId: input.defaultCompanyId,
        actorUserId,
        entityType: "user",
        entityId: user.id,
        action: "user.created",
        afterValue: {
          username: user.username,
          roleCodes,
          companyIds,
          defaultCompanyId: input.defaultCompanyId,
        },
      }),
    });

    return user;
  });
}

export async function setUserStatus(
  db: PrismaClient,
  actorUserId: string,
  input: {
    userId: string;
    status: "ACTIVE" | "INACTIVE";
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
    });
    const updated = await tx.user.update({
      where: { id: input.userId },
      data: { status: input.status },
    });

    if (input.status === "INACTIVE") {
      await tx.userSession.updateMany({
        where: {
          userId: input.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: "account_disabled",
        },
      });
    }

    await tx.auditLog.create({
      data: auditData({
        actorUserId,
        entityType: "user",
        entityId: input.userId,
        action:
          input.status === "INACTIVE"
            ? "user.disabled"
            : "user.reactivated",
        reason: input.reason,
        beforeValue: { status: user.status },
        afterValue: { status: updated.status },
      }),
    });

    return updated;
  });
}

export async function assignUserAccess(
  db: PrismaClient,
  actorUserId: string,
  input: {
    userId: string;
    roleCodes: RoleCode[];
    companyIds: string[];
    defaultCompanyId: string | null;
    reason: string;
    now?: Date;
  },
) {
  const roleCodes = unique(input.roleCodes);
  const companyIds = unique(input.companyIds);
  validateDefaultCompany(companyIds, input.defaultCompanyId);

  if (
    roleCodes.length === 0 ||
    roleCodes.some((role) => !allowedRoleCodes.has(role))
  ) {
    throw new Error("至少需要一個有效角色");
  }

  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      include: {
        roleAssignments: { include: { role: true } },
        companyScopes: true,
      },
    });
    const roles = await tx.role.findMany({
      where: { code: { in: roleCodes }, status: "ACTIVE" },
    });
    const companies = await tx.company.findMany({
      where: { id: { in: companyIds }, status: "ACTIVE" },
    });

    if (roles.length !== roleCodes.length) {
      throw new Error("角色不存在或已停用");
    }

    if (companies.length !== companyIds.length) {
      throw new Error("公司不存在或已停用");
    }

    await tx.user.update({
      where: { id: input.userId },
      data: { defaultCompanyId: null },
    });
    await tx.userSession.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: {
        revokedAt: now,
        revokedReason: "access_changed",
      },
    });
    await tx.userRole.deleteMany({ where: { userId: input.userId } });
    await tx.userCompanyScope.deleteMany({ where: { userId: input.userId } });
    await tx.userRole.createMany({
      data: roles.map((role) => ({
        userId: input.userId,
        roleId: role.id,
      })),
    });
    await tx.userCompanyScope.createMany({
      data: companies.map((company) => ({
        userId: input.userId,
        companyId: company.id,
      })),
    });
    await tx.user.update({
      where: { id: input.userId },
      data: { defaultCompanyId: input.defaultCompanyId },
    });
    await tx.auditLog.create({
      data: auditData({
        companyId: input.defaultCompanyId,
        actorUserId,
        entityType: "user",
        entityId: input.userId,
        action: "user.access_assigned",
        reason: input.reason,
        beforeValue: {
          roleCodes: user.roleAssignments.map(
            (assignment) => assignment.role.code,
          ),
          companyIds: user.companyScopes.map((scope) => scope.companyId),
          defaultCompanyId: user.defaultCompanyId,
        },
        afterValue: {
          roleCodes,
          companyIds,
          defaultCompanyId: input.defaultCompanyId,
        },
      }),
    });
  });
}

export async function revokeAllUserSessions(
  db: PrismaClient,
  actorUserId: string,
  input: {
    userId: string;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    const result = await tx.userSession.updateMany({
      where: {
        userId: input.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokedReason: "admin_revoked",
      },
    });
    await tx.auditLog.create({
      data: auditData({
        actorUserId,
        entityType: "user",
        entityId: input.userId,
        action: "user.sessions_revoked",
        reason: input.reason,
        afterValue: { revokedSessionCount: result.count },
      }),
    });

    return result.count;
  });
}
