import {
  Prisma,
  type FreightMode,
  type FreightRule,
  type PrismaClient,
} from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";
import { requireAdminWithAudit, requirePermission } from "@/lib/auth/authorization";
import { CompanyAccessError, hasCompanyAccess } from "@/lib/auth/company-scope";
import type { RequestContext } from "@/lib/auth/session";
import {
  executeIdempotent,
  type IdempotentResult,
} from "@/lib/idempotency";
import {
  freightLookupInputSchema,
  freightRuleInputSchema,
  freightRuleQuerySchema,
  freightRuleUpdateSchema,
  quantitySchema,
  toDateText,
} from "@/lib/freight/validation";
import { z } from "zod";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const QUANTITY_SCALE = BigInt(10_000);

type FreightRuleInput = z.input<typeof freightRuleInputSchema>;
type FreightRuleUpdate = z.input<typeof freightRuleUpdateSchema>;
type WriteResult = { id: string; replayed: boolean };

export class FreightEntityNotFoundError extends Error {
  readonly code = "FREIGHT_ENTITY_NOT_FOUND";
  constructor(message = "找不到運費規則資料") {
    super(message);
  }
}

export class FreightRuleNotFoundError extends Error {
  readonly code = "FREIGHT_RULE_NOT_FOUND";
  constructor() {
    super("指定條件找不到有效運費規則");
  }
}

export class FreightConstraintError extends Error {
  readonly code = "FREIGHT_CONSTRAINT_CONFLICT";
  constructor(message = "運費規則期間或公司關係發生衝突") {
    super(message);
  }
}

export class FreightRuleStateError extends Error {
  readonly code = "FREIGHT_RULE_STATE_INVALID";
  constructor(message = "已生效運費規則只能調整期間或狀態") {
    super(message);
  }
}

function replayResult(
  result: IdempotentResult<{ id: string }>,
): WriteResult {
  if (result.replayed) {
    if (!result.resultReference) throw new Error("冪等結果缺少識別碼");
    return { id: result.resultReference, replayed: true };
  }
  return { id: result.value.id, replayed: false };
}

function isConstraintError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2004"].includes(error.code)
  ) {
    return true;
  }
  let current: unknown = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as Record<string, unknown>;
    for (const key of ["code", "originalCode", "sqlState"]) {
      const value = candidate[key];
      if (typeof value === "string" && /^23[A-Z0-9]{3}$/.test(value)) {
        return true;
      }
    }
    current = candidate.cause;
  }
  return false;
}

function freightRuleSnapshot(value: FreightRule) {
  return {
    id: value.id,
    customerId: value.customerId,
    companyId: value.companyId,
    deliveryLocationId: value.deliveryLocationId,
    mode: value.mode,
    unitFreight: value.unitFreight?.toFixed(0) ?? null,
    fixedFreight: value.fixedFreight?.toFixed(0) ?? null,
    validFrom: toDateText(value.validFrom),
    validTo: value.validTo ? toDateText(value.validTo) : null,
    status: value.status,
    createdBy: value.createdById,
    updatedBy: value.updatedById,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

async function requireFreightAccess(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
  mode: "read" | "write",
) {
  if (mode === "write") await requireAdminWithAudit(db, context);
  else requirePermission(context, "freight.read");
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
        entityType: "company",
        entityId: companyId,
        operation: "auth.company.denied",
        metadata: { requestedCompanyId: companyId, resource: "freight" },
      }),
    );
    throw new CompanyAccessError();
  }
}

function common(input: {
  context: RequestContext;
  idempotencyKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return {
    userId: input.context.actor.userId,
    now,
    expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
  };
}

function auditContext(input: {
  context: RequestContext;
  companyId: string;
}) {
  return systemAuditContext({
    companyId: input.companyId,
    actorUserId: input.context.actor.userId,
    sessionId: input.context.session.sessionId,
    requestId: input.context.requestId,
  });
}

function scaledQuantity(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(4, "0"));
}

export function calculateFreight(input: {
  mode: FreightMode;
  quantity: string | number;
  unitFreight?: string | null;
  fixedFreight?: string | null;
}): string {
  const quantity = quantitySchema.parse(input.quantity);
  if (input.mode === "NO_CHARGE") return "0";
  if (input.mode === "FIXED_PER_LOCATION") {
    if (input.fixedFreight === null || input.fixedFreight === undefined) {
      throw new FreightConstraintError("固定運費規則缺少固定運費");
    }
    return BigInt(input.fixedFreight).toString();
  }
  if (input.unitFreight === null || input.unitFreight === undefined) {
    throw new FreightConstraintError("按數量計價規則缺少每單位運費");
  }
  const raw = scaledQuantity(quantity) * BigInt(input.unitFreight);
  const whole = raw / QUANTITY_SCALE;
  const remainder = raw % QUANTITY_SCALE;
  return (
    whole +
    (remainder * BigInt(2) >= QUANTITY_SCALE ? BigInt(1) : BigInt(0))
  ).toString();
}

async function requireActiveTargets(
  db: Prisma.TransactionClient,
  input: {
    companyId: string;
    customerId: string;
    deliveryLocationId: string;
  },
) {
  const customerCompany = await db.customerCompany.findFirst({
    where: {
      customerId: input.customerId,
      companyId: input.companyId,
      status: "ACTIVE",
      customer: { status: "ACTIVE" },
    },
  });
  if (!customerCompany) {
    throw new FreightEntityNotFoundError("客戶未授權給此公司");
  }
  const deliveryLocation = await db.deliveryLocation.findFirst({
    where: {
      id: input.deliveryLocationId,
      customerId: input.customerId,
      status: "ACTIVE",
    },
  });
  if (!deliveryLocation) {
    throw new FreightEntityNotFoundError("找不到該客戶的有效送貨地點");
  }
}

export async function listFreightRules(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    query?: unknown;
  },
) {
  await requireFreightAccess(db, input.context, input.companyId, "read");
  const query = freightRuleQuerySchema.parse(input.query ?? {});
  const where: Prisma.FreightRuleWhereInput = {
    companyId: input.companyId,
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.deliveryLocationId
      ? { deliveryLocationId: query.deliveryLocationId }
      : {}),
    ...(query.status === "ALL" ? {} : { status: query.status }),
  };
  const [total, items] = await db.$transaction([
    db.freightRule.count({ where }),
    db.freightRule.findMany({
      where,
      include: {
        customerCompany: {
          include: { customer: { select: { name: true } } },
        },
        deliveryLocation: { select: { code: true, name: true } },
      },
      orderBy: [{ validFrom: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getFreightRule(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    freightRuleId: string;
  },
) {
  await requireFreightAccess(db, input.context, input.companyId, "read");
  const value = await db.freightRule.findFirst({
    where: { id: input.freightRuleId, companyId: input.companyId },
    include: {
      customerCompany: {
        include: { customer: { select: { name: true } } },
      },
      deliveryLocation: true,
    },
  });
  if (!value) throw new FreightEntityNotFoundError();
  return value;
}

export async function createFreightRule(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    freightRule: FreightRuleInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requireFreightAccess(db, input.context, input.companyId, "write");
  const parsed = freightRuleInputSchema.parse(input.freightRule);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "freight_rule.create",
          key: input.idempotencyKey,
          payload: parsed,
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          await requireActiveTargets(tx, {
            companyId: input.companyId,
            customerId: parsed.customerId,
            deliveryLocationId: parsed.deliveryLocationId,
          });
          const value = await tx.freightRule.create({
            data: {
              customerId: parsed.customerId,
              companyId: input.companyId,
              deliveryLocationId: parsed.deliveryLocationId,
              mode: parsed.mode,
              unitFreight: parsed.unitFreight,
              fixedFreight: parsed.fixedFreight,
              validFrom: parsed.validFrom,
              validTo: parsed.validTo,
              status: parsed.status,
              createdById: meta.userId,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "freight_rule",
            entityId: value.id,
            operation: "freight_rule.created",
            afterJson: freightRuleSnapshot(value),
          });
          return {
            value: { id: value.id },
            responseStatus: 201,
            responseMetadata: { id: value.id },
            resultReference: value.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new FreightConstraintError();
    throw error;
  }
}

export async function updateFreightRule(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    freightRuleId: string;
    freightRule: FreightRuleUpdate;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requireFreightAccess(db, input.context, input.companyId, "write");
  const parsed = freightRuleUpdateSchema.parse(input.freightRule);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "freight_rule.update",
          key: input.idempotencyKey,
          payload: { id: input.freightRuleId, ...parsed },
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          const before = await tx.freightRule.findFirst({
            where: { id: input.freightRuleId, companyId: input.companyId },
          });
          if (!before) throw new FreightEntityNotFoundError();
          await requireActiveTargets(tx, {
            companyId: input.companyId,
            customerId: parsed.customerId,
            deliveryLocationId: parsed.deliveryLocationId,
          });
          const today = new Date(`${meta.now.toISOString().slice(0, 10)}T00:00:00.000Z`);
          const modeOrAmountChanged =
            before.mode !== parsed.mode ||
            (before.unitFreight?.toFixed(0) ?? null) !== parsed.unitFreight ||
            (before.fixedFreight?.toFixed(0) ?? null) !== parsed.fixedFreight ||
            before.customerId !== parsed.customerId ||
            before.deliveryLocationId !== parsed.deliveryLocationId;
          if (before.validFrom <= today && modeOrAmountChanged) {
            throw new FreightRuleStateError();
          }
          const value = await tx.freightRule.update({
            where: { id: before.id },
            data: {
              customerId: parsed.customerId,
              deliveryLocationId: parsed.deliveryLocationId,
              mode: parsed.mode,
              unitFreight: parsed.unitFreight,
              fixedFreight: parsed.fixedFreight,
              validFrom: parsed.validFrom,
              validTo: parsed.validTo,
              status: parsed.status,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "freight_rule",
            entityId: value.id,
            operation:
              before.status !== value.status
                ? `freight_rule.${value.status === "ACTIVE" ? "activated" : "deactivated"}`
                : "freight_rule.updated",
            beforeJson: freightRuleSnapshot(before),
            afterJson: freightRuleSnapshot(value),
          });
          return {
            value: { id: value.id },
            responseStatus: 200,
            responseMetadata: { id: value.id },
            resultReference: value.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new FreightConstraintError();
    throw error;
  }
}

export async function quoteFreight(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    deliveryLocationId: string;
    effectiveDate: string;
    quantity: string | number;
  },
) {
  await requireFreightAccess(db, input.context, input.companyId, "read");
  const parsed = freightLookupInputSchema.parse(input);
  const customerCompany = await db.customerCompany.findFirst({
    where: {
      customerId: parsed.customerId,
      companyId: parsed.companyId,
      status: "ACTIVE",
      customer: { status: "ACTIVE" },
    },
  });
  if (!customerCompany) throw new FreightRuleNotFoundError();
  const deliveryLocation = await db.deliveryLocation.findFirst({
    where: {
      id: parsed.deliveryLocationId,
      customerId: parsed.customerId,
      status: "ACTIVE",
    },
  });
  if (!deliveryLocation) throw new FreightRuleNotFoundError();
  const rule = await db.freightRule.findFirst({
    where: {
      companyId: parsed.companyId,
      customerId: parsed.customerId,
      deliveryLocationId: parsed.deliveryLocationId,
      status: "ACTIVE",
      validFrom: { lte: parsed.effectiveDate },
      OR: [{ validTo: null }, { validTo: { gt: parsed.effectiveDate } }],
    },
  });
  if (!rule) throw new FreightRuleNotFoundError();
  return {
    freightRuleId: rule.id,
    mode: rule.mode,
    quantity: parsed.quantity,
    freightAmount: calculateFreight({
      mode: rule.mode,
      quantity: parsed.quantity,
      unitFreight: rule.unitFreight?.toFixed(0) ?? null,
      fixedFreight: rule.fixedFreight?.toFixed(0) ?? null,
    }),
    effectiveDate: toDateText(parsed.effectiveDate),
    validFrom: toDateText(rule.validFrom),
    validTo: rule.validTo ? toDateText(rule.validTo) : null,
  };
}
