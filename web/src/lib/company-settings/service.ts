import {
  Prisma,
  type CompanySetting,
  type PrismaClient,
} from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";
import {
  CompanyAccessError,
  hasCompanyAccess,
} from "@/lib/auth/company-scope";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import type { RequestContext } from "@/lib/auth/session";
import { createRequestId } from "@/lib/correlation";
import {
  executeIdempotent,
  type IdempotentResult,
} from "@/lib/idempotency";
import {
  assertCompanySettingKey,
  COMPANY_SETTING_KEYS,
  type CompanySettingKey,
  type CompanySettingValueByKey,
  validateCompanySetting,
} from "@/lib/company-settings/registry";
import { normalizeUsername } from "@/lib/auth/username";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CompanySettingMissingError extends Error {
  readonly code = "COMPANY_SETTING_MISSING";

  constructor(settingKey: string) {
    super(`找不到有效的公司設定：${settingKey}`);
  }
}

export class CompanySettingVersionConflictError extends Error {
  readonly code = "COMPANY_SETTING_VERSION_CONFLICT";

  constructor() {
    super("同公司、同設定鍵及同生效日的版本已存在");
  }
}

export class CompanySettingVersionNotFoundError extends Error {
  readonly code = "COMPANY_SETTING_VERSION_NOT_FOUND";

  constructor() {
    super("找不到指定的公司設定版本");
  }
}

export class CompanySettingVersionImmutableError extends Error {
  readonly code = "COMPANY_SETTING_VERSION_IMMUTABLE";

  constructor() {
    super("已生效的公司設定版本不可修改或取消");
  }
}

export class FutureEffectiveDateRequiredError extends Error {
  readonly code = "FUTURE_EFFECTIVE_DATE_REQUIRED";

  constructor() {
    super("生效日必須晚於今天");
  }
}

export type CompanySettingWriteResult = {
  id: string;
  replayed: boolean;
};

export type EffectiveCompanySetting<K extends CompanySettingKey> = {
  id: string;
  companyId: string;
  settingKey: K;
  settingValue: CompanySettingValueByKey[K];
  effectiveFrom: Date;
};

export type CompanySettingHistoryEntry = {
  id: string;
  settingKey: CompanySettingKey;
  settingValue: unknown;
  effectiveFrom: string;
  state: "EFFECTIVE" | "FUTURE" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
};

export type CompanySettingAuditContext = {
  actorUserId: string;
  sessionId?: string | null;
  requestId?: string;
};

type CompanySettingReadDatabase = Pick<
  PrismaClient | Prisma.TransactionClient,
  "companySetting"
>;

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error("日期格式必須為 YYYY-MM-DD");
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = utcDate(year, month - 1, day);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("日期不存在");
  }

  return parsed;
}

export function dateOnly(value: Date): Date {
  return utcDate(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function assertFutureDate(effectiveFrom: Date, today: Date): void {
  if (dateOnly(effectiveFrom) <= dateOnly(today)) {
    throw new FutureEffectiveDateRequiredError();
  }
}

function companySettingSnapshot(setting: CompanySetting) {
  return {
    id: setting.id,
    companyId: setting.companyId,
    settingKey: setting.settingKey,
    settingValue: setting.settingValue,
    effectiveFrom: formatDateOnly(setting.effectiveFrom),
    createdAt: setting.createdAt.toISOString(),
    updatedAt: setting.updatedAt.toISOString(),
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function assertDocumentCompanyCodeCanChange(
  tx: Prisma.TransactionClient,
  companyId: string,
  settingKey: string,
): Promise<void> {
  if (settingKey !== COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE) return;
  const issuedDocumentCount = await tx.salesOrder.count({
    where: { companyId },
  });
  if (issuedDocumentCount > 0) {
    throw new CompanySettingVersionImmutableError();
  }
}

export async function requireAdminCompanySettingAccess(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
): Promise<void> {
  await requireAdminWithAudit(db, context);
  const authorizedCompanyIds = context.authorizedCompanies.map(
    (company) => company.id,
  );

  if (!hasCompanyAccess(authorizedCompanyIds, companyId)) {
    await db.$transaction((tx) =>
      writeAudit(tx, {
        ...systemAuditContext({
          companyId: context.selectedCompany?.id,
          actorUserId: context.actor.userId,
          sessionId: context.session.sessionId,
          requestId: context.requestId,
        }),
        entityType: "company",
        entityId: companyId,
        operation: "auth.company.denied",
        metadata: { requestedCompanyId: companyId },
      }),
    );
    throw new CompanyAccessError();
  }
}

function replayResult(
  result: IdempotentResult<{ id: string }>,
): CompanySettingWriteResult {
  if (result.replayed) {
    if (!result.resultReference) {
      throw new Error("冪等操作缺少結果識別碼");
    }
    return { id: result.resultReference, replayed: true };
  }
  return { id: result.value.id, replayed: false };
}

export async function getEffectiveCompanySetting<K extends CompanySettingKey>(
  db: CompanySettingReadDatabase,
  companyId: string,
  settingKey: K,
  effectiveDate: Date,
): Promise<EffectiveCompanySetting<K>> {
  const setting = await db.companySetting.findFirst({
    where: {
      companyId,
      settingKey,
      effectiveFrom: { lte: dateOnly(effectiveDate) },
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!setting) {
    throw new CompanySettingMissingError(settingKey);
  }

  return {
    id: setting.id,
    companyId: setting.companyId,
    settingKey,
    settingValue: validateCompanySetting(settingKey, setting.settingValue),
    effectiveFrom: setting.effectiveFrom,
  };
}

export async function getBillingCutoffDay(
  db: PrismaClient,
  companyId: string,
  effectiveDate: Date,
): Promise<number> {
  return (
    await getEffectiveCompanySetting(
      db,
      companyId,
      COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
      effectiveDate,
    )
  ).settingValue;
}

export type CompanyLegalSettings = {
  companyName: string;
  documentCompanyCode: string;
  companyTaxId: string;
  companyAddress: string;
  companyPhone: string;
};

export async function getCompanyLegalSettings(
  db: CompanySettingReadDatabase,
  companyId: string,
  effectiveDate: Date,
): Promise<CompanyLegalSettings> {
  const [companyName, documentCompanyCode, companyTaxId, companyAddress, companyPhone] =
    await Promise.all([
      getEffectiveCompanySetting(
        db,
        companyId,
        COMPANY_SETTING_KEYS.COMPANY_NAME,
        effectiveDate,
      ),
      getEffectiveCompanySetting(
        db,
        companyId,
        COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE,
        effectiveDate,
      ),
      getEffectiveCompanySetting(
        db,
        companyId,
        COMPANY_SETTING_KEYS.COMPANY_TAX_ID,
        effectiveDate,
      ),
      getEffectiveCompanySetting(
        db,
        companyId,
        COMPANY_SETTING_KEYS.COMPANY_ADDRESS,
        effectiveDate,
      ),
      getEffectiveCompanySetting(
        db,
        companyId,
        COMPANY_SETTING_KEYS.COMPANY_PHONE,
        effectiveDate,
      ),
    ]);

  return {
    companyName: companyName.settingValue,
    documentCompanyCode: documentCompanyCode.settingValue,
    companyTaxId: companyTaxId.settingValue,
    companyAddress: companyAddress.settingValue,
    companyPhone: companyPhone.settingValue,
  };
}

export function resolveBillingCutoffDateFromDay(
  cutoffDay: number,
  year: number,
  month: number,
): Date {
  const parsedDay = validateCompanySetting(
    COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
    cutoffDay,
  );

  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("年份不合法");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("月份不合法");
  }

  const lastDay = utcDate(year, month, 0).getUTCDate();
  return utcDate(year, month - 1, Math.min(parsedDay, lastDay));
}

export async function resolveBillingCutoffDate(
  db: PrismaClient,
  companyId: string,
  year: number,
  month: number,
): Promise<Date> {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("年份不合法");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("月份不合法");
  }
  const monthEnd = utcDate(year, month, 0);
  const cutoffDay = await getBillingCutoffDay(db, companyId, monthEnd);
  return resolveBillingCutoffDateFromDay(cutoffDay, year, month);
}

export async function listCompanySettingHistory(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
  settingKey: string,
  now = new Date(),
): Promise<CompanySettingHistoryEntry[]> {
  await requireAdminCompanySettingAccess(db, context, companyId);
  assertCompanySettingKey(settingKey);
  const today = dateOnly(now);

  const [settings, cancellations] = await Promise.all([
    db.companySetting.findMany({
      where: { companyId, settingKey },
      orderBy: { effectiveFrom: "desc" },
    }),
    db.auditLog.findMany({
      where: {
        companyId,
        entityType: "company_setting",
        operation: "company_setting.future_cancelled",
        metadata: {
          path: ["settingKey"],
          equals: settingKey,
        },
      },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  const currentEntries: CompanySettingHistoryEntry[] = settings.map(
    (setting) => ({
      id: setting.id,
      settingKey,
      settingValue: validateCompanySetting(
        settingKey,
        setting.settingValue,
      ),
      effectiveFrom: formatDateOnly(setting.effectiveFrom),
      state: setting.effectiveFrom <= today ? "EFFECTIVE" : "FUTURE",
      createdAt: setting.createdAt.toISOString(),
      updatedAt: setting.updatedAt.toISOString(),
      cancelledAt: null,
    }),
  );

  const cancelledEntries = cancellations.flatMap((audit) => {
    const before =
      audit.beforeJson &&
      typeof audit.beforeJson === "object" &&
      !Array.isArray(audit.beforeJson)
        ? (audit.beforeJson as Record<string, unknown>)
        : null;
    if (
      !before ||
      typeof before.effectiveFrom !== "string" ||
      before.settingKey !== settingKey
    ) {
      return [];
    }

    return [
      {
        id: audit.entityId,
        settingKey,
        settingValue: validateCompanySetting(
          settingKey,
          before.settingValue,
        ),
        effectiveFrom: before.effectiveFrom,
        state: "CANCELLED" as const,
        createdAt:
          typeof before.createdAt === "string"
            ? before.createdAt
            : audit.occurredAt.toISOString(),
        updatedAt:
          typeof before.updatedAt === "string"
            ? before.updatedAt
            : audit.occurredAt.toISOString(),
        cancelledAt: audit.occurredAt.toISOString(),
      },
    ];
  });

  return [...currentEntries, ...cancelledEntries].sort((left, right) => {
    const byEffectiveDate = right.effectiveFrom.localeCompare(
      left.effectiveFrom,
    );
    if (byEffectiveDate !== 0) return byEffectiveDate;
    return (right.cancelledAt ?? right.updatedAt).localeCompare(
      left.cancelledAt ?? left.updatedAt,
    );
  });
}

type WriteOptions = {
  context: RequestContext;
  companyId: string;
  settingKey: string;
  settingValue: unknown;
  effectiveFrom: Date;
  idempotencyKey: string;
  now?: Date;
};

export async function createFutureSettingVersion(
  db: PrismaClient,
  input: WriteOptions,
): Promise<CompanySettingWriteResult> {
  await requireAdminCompanySettingAccess(db, input.context, input.companyId);
  assertCompanySettingKey(input.settingKey);
  const now = input.now ?? new Date();
  const effectiveFrom = dateOnly(input.effectiveFrom);
  assertFutureDate(effectiveFrom, now);
  const settingValue = validateCompanySetting(
    input.settingKey,
    input.settingValue,
  );

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: input.context.actor.userId,
          operation: "company_setting.future_create",
          key: input.idempotencyKey,
          payload: {
            settingKey: input.settingKey,
            settingValue,
            effectiveFrom: formatDateOnly(effectiveFrom),
          },
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          now,
        },
        async (tx) => {
          await assertDocumentCompanyCodeCanChange(
            tx,
            input.companyId,
            input.settingKey,
          );
          const setting = await tx.companySetting.create({
            data: {
              companyId: input.companyId,
              settingKey: input.settingKey,
              settingValue,
              effectiveFrom,
            },
          });
          await writeAudit(tx, {
            ...systemAuditContext({
              companyId: input.companyId,
              actorUserId: input.context.actor.userId,
              sessionId: input.context.session.sessionId,
              requestId: input.context.requestId,
            }),
            entityType: "company_setting",
            entityId: setting.id,
            operation: "company_setting.future_created",
            afterJson: companySettingSnapshot(setting),
            metadata: { settingKey: input.settingKey },
          });
          return {
            value: { id: setting.id },
            responseStatus: 201,
            responseMetadata: { id: setting.id },
            resultReference: setting.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new CompanySettingVersionConflictError();
    }
    throw error;
  }
}

export async function updateFutureSettingVersion(
  db: PrismaClient,
  input: WriteOptions & { id: string },
): Promise<CompanySettingWriteResult> {
  await requireAdminCompanySettingAccess(db, input.context, input.companyId);
  assertCompanySettingKey(input.settingKey);
  const now = input.now ?? new Date();
  const effectiveFrom = dateOnly(input.effectiveFrom);
  assertFutureDate(effectiveFrom, now);
  const settingValue = validateCompanySetting(
    input.settingKey,
    input.settingValue,
  );

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: input.context.actor.userId,
          operation: "company_setting.future_update",
          key: input.idempotencyKey,
          payload: {
            id: input.id,
            settingKey: input.settingKey,
            settingValue,
            effectiveFrom: formatDateOnly(effectiveFrom),
          },
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          now,
        },
        async (tx) => {
          await assertDocumentCompanyCodeCanChange(
            tx,
            input.companyId,
            input.settingKey,
          );
          const existing = await tx.companySetting.findFirst({
            where: {
              id: input.id,
              companyId: input.companyId,
              settingKey: input.settingKey,
            },
          });
          if (!existing) {
            throw new CompanySettingVersionNotFoundError();
          }
          if (existing.effectiveFrom <= dateOnly(now)) {
            throw new CompanySettingVersionImmutableError();
          }

          const setting = await tx.companySetting.update({
            where: { id: existing.id },
            data: { settingValue, effectiveFrom },
          });
          await writeAudit(tx, {
            ...systemAuditContext({
              companyId: input.companyId,
              actorUserId: input.context.actor.userId,
              sessionId: input.context.session.sessionId,
              requestId: input.context.requestId,
            }),
            entityType: "company_setting",
            entityId: setting.id,
            operation: "company_setting.future_updated",
            beforeJson: companySettingSnapshot(existing),
            afterJson: companySettingSnapshot(setting),
            metadata: { settingKey: input.settingKey },
          });
          return {
            value: { id: setting.id },
            responseStatus: 200,
            responseMetadata: { id: setting.id },
            resultReference: setting.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new CompanySettingVersionConflictError();
    }
    throw error;
  }
}

export async function cancelFutureSettingVersion(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    id: string;
    settingKey: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<CompanySettingWriteResult> {
  await requireAdminCompanySettingAccess(db, input.context, input.companyId);
  assertCompanySettingKey(input.settingKey);
  const now = input.now ?? new Date();

  return replayResult(
    await executeIdempotent(
      db,
      {
        companyId: input.companyId,
        userId: input.context.actor.userId,
        operation: "company_setting.future_cancel",
        key: input.idempotencyKey,
        payload: { id: input.id, settingKey: input.settingKey },
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        now,
      },
      async (tx) => {
        await assertDocumentCompanyCodeCanChange(
          tx,
          input.companyId,
          input.settingKey,
        );
        const existing = await tx.companySetting.findFirst({
          where: {
            id: input.id,
            companyId: input.companyId,
            settingKey: input.settingKey,
          },
        });
        if (!existing) {
          throw new CompanySettingVersionNotFoundError();
        }
        if (existing.effectiveFrom <= dateOnly(now)) {
          throw new CompanySettingVersionImmutableError();
        }

        await writeAudit(tx, {
          ...systemAuditContext({
            companyId: input.companyId,
            actorUserId: input.context.actor.userId,
            sessionId: input.context.session.sessionId,
            requestId: input.context.requestId,
          }),
          entityType: "company_setting",
          entityId: existing.id,
          operation: "company_setting.future_cancelled",
          beforeJson: companySettingSnapshot(existing),
          metadata: { settingKey: input.settingKey },
        });
        await tx.companySetting.delete({ where: { id: existing.id } });
        return {
          value: { id: existing.id },
          responseStatus: 200,
          responseMetadata: { id: existing.id },
          resultReference: existing.id,
        };
      },
    ),
  );
}

export async function bootstrapInitialCompanySettings(
  db: PrismaClient,
  input: {
    adminUsername: string;
    effectiveFrom: Date;
    requestId?: string;
  },
): Promise<
  Array<{
    companyCode: string;
    settingKey: CompanySettingKey;
    settingId: string;
    created: boolean;
  }>
> {
  const initialSettings = [
    {
      companyCode: "INDUSTRIAL",
      values: {
        [COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY]: 25,
        [COMPANY_SETTING_KEYS.COMPANY_NAME]: "奇麗實業有限公司",
        [COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE]: "IN",
        [COMPANY_SETTING_KEYS.COMPANY_TAX_ID]: "60603347",
        [COMPANY_SETTING_KEYS.COMPANY_ADDRESS]:
          "新北市中和區國光街109巷22弄13號",
        [COMPANY_SETTING_KEYS.COMPANY_PHONE]: "02-29571175",
      },
    },
    {
      companyCode: "BIOTECH",
      values: {
        [COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY]: 20,
        [COMPANY_SETTING_KEYS.COMPANY_NAME]: "奇麗生技有限公司",
        [COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE]: "BI",
        [COMPANY_SETTING_KEYS.COMPANY_TAX_ID]: "60377546",
        [COMPANY_SETTING_KEYS.COMPANY_ADDRESS]:
          "新北市中和區國光街109巷22弄13號",
        [COMPANY_SETTING_KEYS.COMPANY_PHONE]: "02-26805751",
      },
    },
  ] as const;
  const effectiveFrom = dateOnly(input.effectiveFrom);
  const requestId = createRequestId(input.requestId);

  return db.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: {
        normalizedUsername: normalizeUsername(input.adminUsername),
      },
      include: {
        roleAssignments: { include: { role: true } },
        companyScopes: true,
      },
    });
    if (
      !admin ||
      admin.status !== "ACTIVE" ||
      !admin.roleAssignments.some(
        (assignment) =>
          assignment.role.code === "ADMIN" &&
          assignment.role.status === "ACTIVE",
      )
    ) {
      throw new Error("找不到有效的初始管理員");
    }

    const companies = await tx.company.findMany({
      where: {
        code: { in: initialSettings.map((setting) => setting.companyCode) },
        status: "ACTIVE",
      },
    });
    const companiesByCode = new Map(
      companies.map((company) => [company.code, company]),
    );
    const scopedCompanyIds = new Set(
      admin.companyScopes.map((scope) => scope.companyId),
    );
    const results: Array<{
      companyCode: string;
      settingKey: CompanySettingKey;
      settingId: string;
      created: boolean;
    }> = [];

    for (const initial of initialSettings) {
      const company = companiesByCode.get(initial.companyCode);
      if (!company || !scopedCompanyIds.has(company.id)) {
        throw new Error(
          `初始管理員沒有公司權限或公司不存在：${initial.companyCode}`,
        );
      }
      for (const [rawKey, rawValue] of Object.entries(initial.values)) {
        assertCompanySettingKey(rawKey);
        const settingKey = rawKey;
        const settingValue = validateCompanySetting(settingKey, rawValue);
        const exactVersion = await tx.companySetting.findUnique({
          where: {
            companyId_settingKey_effectiveFrom: {
              companyId: company.id,
              settingKey,
              effectiveFrom,
            },
          },
        });
        if (exactVersion) {
          const existingValue = validateCompanySetting(
            settingKey,
            exactVersion.settingValue,
          );
          if (existingValue !== settingValue) {
            throw new CompanySettingVersionConflictError();
          }
          results.push({
            companyCode: company.code,
            settingKey,
            settingId: exactVersion.id,
            created: false,
          });
          continue;
        }
        const effectiveVersion = await tx.companySetting.findFirst({
          where: {
            companyId: company.id,
            settingKey,
            effectiveFrom: { lte: effectiveFrom },
          },
          orderBy: { effectiveFrom: "desc" },
        });
        if (effectiveVersion) {
          const existingValue = validateCompanySetting(
            settingKey,
            effectiveVersion.settingValue,
          );
          if (existingValue !== settingValue) {
            throw new CompanySettingVersionConflictError();
          }
          results.push({
            companyCode: company.code,
            settingKey,
            settingId: effectiveVersion.id,
            created: false,
          });
          continue;
        }

        const created = await tx.companySetting.create({
          data: {
            companyId: company.id,
            settingKey,
            settingValue,
            effectiveFrom,
          },
        });
        await writeAudit(tx, {
          ...systemAuditContext({
            companyId: company.id,
            actorUserId: admin.id,
            requestId,
          }),
          entityType: "company_setting",
          entityId: created.id,
          operation: "bootstrap.company_setting.created",
          afterJson: companySettingSnapshot(created),
          metadata: {
            settingKey,
            companyCode: company.code,
          },
        });
        results.push({
          companyCode: company.code,
          settingKey,
          settingId: created.id,
          created: true,
        });
      }
    }

    return results;
  });
}
