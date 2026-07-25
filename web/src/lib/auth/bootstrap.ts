import type { PrismaClient } from "@/generated/prisma/client";
import { auditData } from "@/lib/audit";
import { ROLE_CODES } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { normalizeUsername } from "@/lib/auth/username";

export type BootstrapAdminInput = {
  username: string;
  password: string;
  companyCode: string;
  companyName: string;
};

export type BootstrapAdditionalCompanyInput = {
  username: string;
  companyCode: string;
  companyName: string;
};

export async function bootstrapAdmin(
  db: PrismaClient,
  input: BootstrapAdminInput,
): Promise<{ created: boolean; userId: string }> {
  const normalizedUsername = normalizeUsername(input.username);
  const existing = await db.user.findUnique({
    where: { normalizedUsername },
    select: { id: true },
  });

  if (existing) {
    return { created: false, userId: existing.id };
  }

  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    const repeatedCheck = await tx.user.findUnique({
      where: { normalizedUsername },
      select: { id: true },
    });

    if (repeatedCheck) {
      return { created: false, userId: repeatedCheck.id };
    }

    const company = await tx.company.upsert({
      where: { code: input.companyCode },
      update: {},
      create: {
        code: input.companyCode,
        name: input.companyName,
      },
    });
    const adminRole = await tx.role.upsert({
      where: { code: ROLE_CODES.ADMIN },
      update: { name: "管理員", status: "ACTIVE" },
      create: {
        code: ROLE_CODES.ADMIN,
        name: "管理員",
      },
    });

    await tx.role.upsert({
      where: { code: ROLE_CODES.ORDER_ENTRY },
      update: { name: "訂單輸入人員", status: "ACTIVE" },
      create: {
        code: ROLE_CODES.ORDER_ENTRY,
        name: "訂單輸入人員",
      },
    });

    const user = await tx.user.create({
      data: {
        username: input.username.trim(),
        normalizedUsername,
        passwordHash,
      },
    });

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId: adminRole.id,
      },
    });
    await tx.userCompanyScope.create({
      data: {
        userId: user.id,
        companyId: company.id,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { defaultCompanyId: company.id },
    });
    await tx.auditLog.create({
      data: auditData({
        companyId: company.id,
        actorUserId: user.id,
        entityType: "user",
        entityId: user.id,
        action: "bootstrap.created",
        afterValue: {
          username: user.username,
          roles: [ROLE_CODES.ADMIN],
          companyIds: [company.id],
          defaultCompanyId: company.id,
        },
      }),
    });

    return { created: true, userId: user.id };
  });
}

export async function bootstrapAdditionalCompanyScope(
  db: PrismaClient,
  input: BootstrapAdditionalCompanyInput,
): Promise<{ created: boolean; companyId: string; userId: string }> {
  const normalizedUsername = normalizeUsername(input.username);

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { normalizedUsername },
      select: { id: true },
    });
    const company = await tx.company.upsert({
      where: { code: input.companyCode },
      update: {},
      create: {
        code: input.companyCode,
        name: input.companyName,
      },
    });
    const existingScope = await tx.userCompanyScope.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: company.id,
        },
      },
      select: { id: true },
    });

    if (existingScope) {
      return {
        created: false,
        companyId: company.id,
        userId: user.id,
      };
    }

    await tx.userCompanyScope.create({
      data: {
        userId: user.id,
        companyId: company.id,
      },
    });
    await tx.auditLog.create({
      data: auditData({
        companyId: company.id,
        actorUserId: user.id,
        entityType: "company",
        entityId: company.id,
        action: "bootstrap.company_scope_added",
        afterValue: {
          companyCode: company.code,
          userId: user.id,
        },
      }),
    });

    return {
      created: true,
      companyId: company.id,
      userId: user.id,
    };
  });
}
