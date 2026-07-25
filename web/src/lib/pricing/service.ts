import {
  Prisma,
  type CustomerPriceListAssignment,
  type ItemPrice,
  type PriceList,
  type PrismaClient,
} from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";
import { requireAdminWithAudit, requirePermission } from "@/lib/auth/authorization";
import {
  CompanyAccessError,
  hasCompanyAccess,
} from "@/lib/auth/company-scope";
import type { RequestContext } from "@/lib/auth/session";
import {
  executeIdempotent,
  type IdempotentResult,
} from "@/lib/idempotency";
import {
  itemPriceInputSchema,
  normalizePriceListCode,
  periodAdjustmentSchema,
  priceAssignmentInputSchema,
  priceListInputSchema,
  priceListQuerySchema,
  priceLookupInputSchema,
  toDateText,
} from "@/lib/pricing/validation";
import { z } from "zod";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
type PriceListInput = z.input<typeof priceListInputSchema>;
type ItemPriceInput = z.input<typeof itemPriceInputSchema>;
type PeriodInput = z.input<typeof periodAdjustmentSchema>;
type AssignmentInput = z.input<typeof priceAssignmentInputSchema>;

export class PricingNotFoundError extends Error {
  readonly code = "PRICING_ENTITY_NOT_FOUND";
  constructor(message = "找不到價格資料") {
    super(message);
  }
}

export class PriceNotFoundError extends Error {
  readonly code = "PRICE_NOT_FOUND";
  constructor() {
    super("指定條件找不到有效正式價格");
  }
}

export class PricingConstraintError extends Error {
  readonly code = "PRICING_CONSTRAINT_CONFLICT";
  constructor(message = "價格期間、代碼或公司關係發生衝突") {
    super(message);
  }
}

type WriteResult = { id: string; replayed: boolean };

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

function priceListSnapshot(value: PriceList) {
  return {
    id: value.id,
    companyId: value.companyId,
    code: value.code,
    normalizedCode: value.normalizedCode,
    name: value.name,
    status: value.status,
    createdBy: value.createdById,
    updatedBy: value.updatedById,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function itemPriceSnapshot(value: ItemPrice) {
  return {
    id: value.id,
    priceListId: value.priceListId,
    itemId: value.itemId,
    unitPrice: value.unitPrice.toFixed(5),
    validFrom: toDateText(value.validFrom),
    validTo: value.validTo ? toDateText(value.validTo) : null,
    status: value.status,
    createdBy: value.createdById,
    updatedBy: value.updatedById,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function assignmentSnapshot(value: CustomerPriceListAssignment) {
  return {
    id: value.id,
    customerId: value.customerId,
    companyId: value.companyId,
    priceListId: value.priceListId,
    validFrom: toDateText(value.validFrom),
    validTo: value.validTo ? toDateText(value.validTo) : null,
    status: value.status,
    createdBy: value.createdById,
    updatedBy: value.updatedById,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

async function requirePricingAccess(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
  mode: "read" | "write",
) {
  if (mode === "write") await requireAdminWithAudit(db, context);
  else requirePermission(context, "pricing.read");
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
        metadata: { requestedCompanyId: companyId, resource: "pricing" },
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

export async function listPriceLists(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    query?: unknown;
  },
) {
  await requirePricingAccess(db, input.context, input.companyId, "read");
  const query = priceListQuerySchema.parse(input.query ?? {});
  const where: Prisma.PriceListWhereInput = {
    companyId: input.companyId,
    ...(query.status === "ALL" ? {} : { status: query.status }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            {
              normalizedCode: {
                contains: normalizePriceListCode(query.search),
              },
            },
          ],
        }
      : {}),
  };
  const [total, items] = await db.$transaction([
    db.priceList.count({ where }),
    db.priceList.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
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

export async function getPriceList(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    priceListId: string;
  },
) {
  await requirePricingAccess(db, input.context, input.companyId, "read");
  const value = await db.priceList.findFirst({
    where: { id: input.priceListId, companyId: input.companyId },
    include: {
      itemPrices: {
        include: { item: { select: { code: true, name: true } } },
        orderBy: [{ item: { code: "asc" } }, { validFrom: "desc" }],
      },
      assignments: {
        include: { customer: { select: { name: true } } },
        orderBy: [{ validFrom: "desc" }],
      },
    },
  });
  if (!value) throw new PricingNotFoundError("找不到價格表");
  return value;
}

export async function createPriceList(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    priceList: PriceListInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requirePricingAccess(db, input.context, input.companyId, "write");
  const parsed = priceListInputSchema.parse(input.priceList);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "price_list.create",
          key: input.idempotencyKey,
          payload: parsed,
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          const value = await tx.priceList.create({
            data: {
              companyId: input.companyId,
              code: parsed.code,
              normalizedCode: normalizePriceListCode(parsed.code),
              name: parsed.name,
              createdById: meta.userId,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "price_list",
            entityId: value.id,
            operation: "price_list.created",
            afterJson: priceListSnapshot(value),
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
    if (isConstraintError(error)) throw new PricingConstraintError();
    throw error;
  }
}

export async function updatePriceList(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    priceListId: string;
    priceList: PriceListInput & { status: "ACTIVE" | "INACTIVE" };
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requirePricingAccess(db, input.context, input.companyId, "write");
  const { status, ...data } = input.priceList;
  const parsed = priceListInputSchema.parse(data);
  const parsedStatus = z.enum(["ACTIVE", "INACTIVE"]).parse(status);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "price_list.update",
          key: input.idempotencyKey,
          payload: { id: input.priceListId, ...parsed, status: parsedStatus },
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          const before = await tx.priceList.findFirst({
            where: { id: input.priceListId, companyId: input.companyId },
          });
          if (!before) throw new PricingNotFoundError("找不到價格表");
          const value = await tx.priceList.update({
            where: { id: before.id },
            data: {
              code: parsed.code,
              normalizedCode: normalizePriceListCode(parsed.code),
              name: parsed.name,
              status: parsedStatus,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "price_list",
            entityId: value.id,
            operation:
              before.status !== value.status
                ? `price_list.${value.status === "ACTIVE" ? "activated" : "deactivated"}`
                : "price_list.updated",
            beforeJson: priceListSnapshot(before),
            afterJson: priceListSnapshot(value),
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
    if (isConstraintError(error)) throw new PricingConstraintError();
    throw error;
  }
}

export async function createItemPriceVersion(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    priceListId: string;
    price: ItemPriceInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requirePricingAccess(db, input.context, input.companyId, "write");
  const parsed = itemPriceInputSchema.parse(input.price);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "item_price.create",
          key: input.idempotencyKey,
          payload: { priceListId: input.priceListId, ...parsed },
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          const priceList = await tx.priceList.findFirst({
            where: { id: input.priceListId, companyId: input.companyId },
          });
          if (!priceList) throw new PricingNotFoundError("找不到價格表");
          const itemRelation = await tx.itemCompany.findFirst({
            where: {
              itemId: parsed.itemId,
              companyId: input.companyId,
              status: "ACTIVE",
              item: { status: "ACTIVE" },
            },
          });
          if (!itemRelation) throw new PricingNotFoundError("找不到公司品項");
          const value = await tx.itemPrice.create({
            data: {
              priceListId: priceList.id,
              itemId: parsed.itemId,
              unitPrice: parsed.unitPrice,
              validFrom: parsed.validFrom,
              validTo: parsed.validTo,
              status: parsed.status,
              createdById: meta.userId,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "item_price",
            entityId: value.id,
            operation: "item_price.created",
            afterJson: itemPriceSnapshot(value),
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
    if (isConstraintError(error)) {
      throw new PricingConstraintError("品項價格期間重疊或資料不合法");
    }
    throw error;
  }
}

export async function adjustItemPricePeriod(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    itemPriceId: string;
    adjustment: PeriodInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requirePricingAccess(db, input.context, input.companyId, "write");
  const parsed = periodAdjustmentSchema.parse(input.adjustment);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "item_price.period.adjust",
          key: input.idempotencyKey,
          payload: { itemPriceId: input.itemPriceId, ...parsed },
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          const before = await tx.itemPrice.findFirst({
            where: {
              id: input.itemPriceId,
              priceList: { companyId: input.companyId },
            },
          });
          if (!before) throw new PricingNotFoundError("找不到價格版本");
          const value = await tx.itemPrice.update({
            where: { id: before.id },
            data: {
              validFrom: parsed.validFrom,
              validTo: parsed.validTo,
              status: parsed.status,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "item_price",
            entityId: value.id,
            operation: "item_price.period_adjusted",
            beforeJson: itemPriceSnapshot(before),
            afterJson: itemPriceSnapshot(value),
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
    if (isConstraintError(error)) {
      throw new PricingConstraintError("品項價格期間重疊或資料不合法");
    }
    throw error;
  }
}

export async function createPriceAssignment(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    assignment: AssignmentInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requirePricingAccess(db, input.context, input.companyId, "write");
  const parsed = priceAssignmentInputSchema.parse(input.assignment);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "price_assignment.create",
          key: input.idempotencyKey,
          payload: parsed,
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          const customerCompany = await tx.customerCompany.findFirst({
            where: {
              customerId: parsed.customerId,
              companyId: input.companyId,
              status: "ACTIVE",
              customer: { status: "ACTIVE" },
            },
          });
          if (!customerCompany) {
            throw new PricingNotFoundError("客戶未授權給此公司");
          }
          const priceList = await tx.priceList.findFirst({
            where: {
              id: parsed.priceListId,
              companyId: input.companyId,
            },
          });
          if (!priceList) throw new PricingNotFoundError("找不到價格表");
          const value = await tx.customerPriceListAssignment.create({
            data: {
              customerId: parsed.customerId,
              companyId: input.companyId,
              priceListId: priceList.id,
              validFrom: parsed.validFrom,
              validTo: parsed.validTo,
              status: parsed.status,
              createdById: meta.userId,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "customer_price_list_assignment",
            entityId: value.id,
            operation: "price_assignment.created",
            afterJson: assignmentSnapshot(value),
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
    if (isConstraintError(error)) {
      throw new PricingConstraintError("客戶指派期間重疊或公司不一致");
    }
    throw error;
  }
}

export async function adjustPriceAssignmentPeriod(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    assignmentId: string;
    adjustment: PeriodInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  await requirePricingAccess(db, input.context, input.companyId, "write");
  const parsed = periodAdjustmentSchema.parse(input.adjustment);
  const meta = common(input);
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: meta.userId,
          operation: "price_assignment.period.adjust",
          key: input.idempotencyKey,
          payload: { assignmentId: input.assignmentId, ...parsed },
          expiresAt: meta.expiresAt,
          now: meta.now,
        },
        async (tx) => {
          const before = await tx.customerPriceListAssignment.findFirst({
            where: { id: input.assignmentId, companyId: input.companyId },
          });
          if (!before) throw new PricingNotFoundError("找不到客戶價格表指派");
          const value = await tx.customerPriceListAssignment.update({
            where: { id: before.id },
            data: {
              validFrom: parsed.validFrom,
              validTo: parsed.validTo,
              status: parsed.status,
              updatedById: meta.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "customer_price_list_assignment",
            entityId: value.id,
            operation: "price_assignment.period_adjusted",
            beforeJson: assignmentSnapshot(before),
            afterJson: assignmentSnapshot(value),
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
    if (isConstraintError(error)) {
      throw new PricingConstraintError("客戶指派期間重疊或資料不合法");
    }
    throw error;
  }
}

export async function getEffectivePrice(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    itemId: string;
    effectiveDate: string;
  },
) {
  await requirePricingAccess(db, input.context, input.companyId, "read");
  const parsed = priceLookupInputSchema.parse(input);
  const customerCompany = await db.customerCompany.findFirst({
    where: {
      customerId: parsed.customerId,
      companyId: parsed.companyId,
      status: "ACTIVE",
      customer: { status: "ACTIVE" },
    },
  });
  if (!customerCompany) throw new PriceNotFoundError();
  const itemCompany = await db.itemCompany.findFirst({
    where: {
      itemId: parsed.itemId,
      companyId: parsed.companyId,
      status: "ACTIVE",
      salesEnabled: true,
      item: { status: "ACTIVE", salesEnabled: true },
    },
  });
  if (!itemCompany) throw new PriceNotFoundError();
  const assignment = await db.customerPriceListAssignment.findFirst({
    where: {
      customerId: parsed.customerId,
      companyId: parsed.companyId,
      status: "ACTIVE",
      validFrom: { lte: parsed.effectiveDate },
      OR: [{ validTo: null }, { validTo: { gt: parsed.effectiveDate } }],
      priceList: { status: "ACTIVE" },
    },
  });
  if (!assignment) throw new PriceNotFoundError();
  const price = await db.itemPrice.findFirst({
    where: {
      priceListId: assignment.priceListId,
      itemId: parsed.itemId,
      status: "ACTIVE",
      validFrom: { lte: parsed.effectiveDate },
      OR: [{ validTo: null }, { validTo: { gt: parsed.effectiveDate } }],
    },
  });
  if (!price) throw new PriceNotFoundError();
  return {
    priceListId: assignment.priceListId,
    assignmentId: assignment.id,
    itemPriceId: price.id,
    unitPrice: price.unitPrice.toFixed(5),
    effectiveDate: toDateText(parsed.effectiveDate),
    validFrom: toDateText(price.validFrom),
    validTo: price.validTo ? toDateText(price.validTo) : null,
  };
}
