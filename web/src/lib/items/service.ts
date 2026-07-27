import {
  Prisma,
  type Item,
  type ItemCompany,
  type PrismaClient,
} from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";
import { requireAdminWithAudit, requirePermission } from "@/lib/auth/authorization";
import { hasRole } from "@/lib/auth/rbac";
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
  itemCompanyInputSchema,
  itemInputSchema,
  itemListQuerySchema,
  normalizeBarcode,
  normalizeItemCode,
} from "@/lib/items/validation";
import { z } from "zod";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

type ItemInput = z.input<typeof itemInputSchema>;
type ItemCompanyInput = z.input<typeof itemCompanyInputSchema>;

export class ItemNotFoundError extends Error {
  readonly code = "ITEM_NOT_FOUND";
  constructor() {
    super("找不到可供此公司使用的品項");
  }
}

export class ItemConstraintError extends Error {
  readonly code = "ITEM_CONSTRAINT_CONFLICT";
  constructor(message = "品項資料違反唯一或完整性限制") {
    super(message);
  }
}

export type ItemWriteResult = {
  id: string;
  replayed: boolean;
};

function replayResult(
  result: IdempotentResult<{ id: string }>,
): ItemWriteResult {
  if (result.replayed) {
    if (!result.resultReference) {
      throw new Error("冪等結果缺少品項識別碼");
    }
    return { id: result.resultReference, replayed: true };
  }
  return { id: result.value.id, replayed: false };
}

function isConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2004"].includes(error.code)
  );
}

function itemSnapshot(item: Item) {
  return {
    id: item.id,
    code: item.code,
    normalizedCode: item.normalizedCode,
    name: item.name,
    description: item.description,
    specification: item.specification,
    baseUnit: item.baseUnit,
    barcode: item.barcode,
    itemType: item.itemType,
    salesEnabled: item.salesEnabled,
    purchaseEnabled: item.purchaseEnabled,
    inventoryEnabled: item.inventoryEnabled,
    productionEnabled: item.productionEnabled,
    status: item.status,
    createdBy: item.createdById,
    updatedBy: item.updatedById,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function relationSnapshot(relation: ItemCompany) {
  return {
    id: relation.id,
    itemId: relation.itemId,
    companyId: relation.companyId,
    companyItemCode: relation.companyItemCode,
    normalizedCompanyItemCode: relation.normalizedCompanyItemCode,
    salesEnabled: relation.salesEnabled,
    status: relation.status,
    createdBy: relation.createdById,
    updatedBy: relation.updatedById,
    createdAt: relation.createdAt.toISOString(),
    updatedAt: relation.updatedAt.toISOString(),
  };
}

async function requireItemAccess(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
  mode: "read" | "write",
): Promise<void> {
  if (mode === "write") {
    await requireAdminWithAudit(db, context);
  } else {
    requirePermission(context, "items.read");
  }

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
        metadata: { requestedCompanyId: companyId, resource: "item" },
      }),
    );
    throw new CompanyAccessError();
  }
}

function writeInput(input: {
  context: RequestContext;
  idempotencyKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return {
    userId: input.context.actor.userId,
    expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    now,
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

export async function listItems(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    query?: unknown;
  },
) {
  await requireItemAccess(db, input.context, input.companyId, "read");
  const query = itemListQuerySchema.parse(input.query ?? {});
  const isAdmin = hasRole(input.context.roleCodes, "ADMIN");
  const availability = isAdmin ? query.availability : "SALEABLE";
  const effectiveStatus =
    availability === "ALL" && isAdmin ? query.status : "ACTIVE";
  const normalizedSearch = normalizeItemCode(query.search);

  const relationWhere: Prisma.ItemCompanyWhereInput = {
    companyId: input.companyId,
    ...(availability === "ALL" ? {} : { status: "ACTIVE" }),
    ...(availability === "SALEABLE" ? { salesEnabled: true } : {}),
  };
  const where: Prisma.ItemWhereInput = {
    ...(effectiveStatus === "ALL" ? {} : { status: effectiveStatus }),
    ...(query.itemType === "ALL" ? {} : { itemType: query.itemType }),
    ...(availability === "SALEABLE" ? { salesEnabled: true } : {}),
    companyRelations: { some: relationWhere },
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { normalizedCode: { contains: normalizedSearch } },
            { barcode: { contains: query.search.trim() } },
            {
              companyRelations: {
                some: {
                  companyId: input.companyId,
                  normalizedCompanyItemCode: {
                    contains: normalizedSearch,
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, items] = await db.$transaction([
    db.item.count({ where }),
    db.item.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        companyRelations: {
          where: { companyId: input.companyId },
          select: {
            companyId: true,
            companyItemCode: true,
            salesEnabled: true,
            status: true,
          },
        },
      },
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

export function listAvailableItems(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    query?: unknown;
  },
) {
  return listItems(db, {
    ...input,
    query: { ...(input.query as object), availability: "AVAILABLE" },
  });
}

export function listSaleableItems(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    query?: unknown;
  },
) {
  return listItems(db, {
    ...input,
    query: { ...(input.query as object), availability: "SALEABLE" },
  });
}

export async function getItem(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    itemId: string;
    includeInactive?: boolean;
  },
) {
  await requireItemAccess(db, input.context, input.companyId, "read");
  const isAdmin = hasRole(input.context.roleCodes, "ADMIN");
  const includeInactive = Boolean(input.includeInactive) && isAdmin;
  const item = await db.item.findFirst({
    where: {
      id: input.itemId,
      ...(includeInactive
        ? {}
        : { status: "ACTIVE", salesEnabled: true }),
      companyRelations: {
        some: {
          companyId: input.companyId,
          ...(includeInactive
            ? {}
            : { status: "ACTIVE", salesEnabled: true }),
        },
      },
    },
    include: {
      companyRelations: {
        where: {
          companyId: {
            in: input.context.authorizedCompanies.map((company) => company.id),
          },
        },
        include: { company: { select: { code: true, name: true } } },
        orderBy: { company: { code: "asc" } },
      },
    },
  });
  if (!item) throw new ItemNotFoundError();
  return item;
}

export async function createItem(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    item: ItemInput;
    companyRelation: ItemCompanyInput;
    idempotencyKey: string;
    now?: Date;
    afterWrite?: (
      tx: Prisma.TransactionClient,
      result: { id: string },
    ) => Promise<void>;
  },
): Promise<ItemWriteResult> {
  await requireItemAccess(db, input.context, input.companyId, "write");
  const item = itemInputSchema.parse(input.item);
  const relation = itemCompanyInputSchema.parse(input.companyRelation);
  const common = writeInput(input);

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: "item.create",
          key: input.idempotencyKey,
          payload: { item, relation },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          const created = await tx.item.create({
            data: {
              code: item.code,
              normalizedCode: normalizeItemCode(item.code),
              name: item.name,
              description: item.description,
              specification: item.specification,
              baseUnit: item.baseUnit,
              barcode: normalizeBarcode(item.barcode),
              itemType: item.itemType,
              salesEnabled: item.salesEnabled,
              purchaseEnabled: item.purchaseEnabled,
              inventoryEnabled: item.inventoryEnabled,
              productionEnabled: item.productionEnabled,
              createdById: common.userId,
              updatedById: common.userId,
            },
          });
          const companyRelation = await tx.itemCompany.create({
            data: {
              itemId: created.id,
              companyId: input.companyId,
              companyItemCode: relation.companyItemCode,
              normalizedCompanyItemCode: normalizeItemCode(
                relation.companyItemCode,
              ),
              salesEnabled: relation.salesEnabled,
              status: relation.status,
              createdById: common.userId,
              updatedById: common.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "item",
            entityId: created.id,
            operation: "item.created",
            afterJson: itemSnapshot(created),
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "item_company",
            entityId: companyRelation.id,
            operation: "item_company.created",
            afterJson: relationSnapshot(companyRelation),
          });
          await input.afterWrite?.(tx, { id: created.id });
          return {
            value: { id: created.id },
            responseStatus: 201,
            responseMetadata: { id: created.id },
            resultReference: created.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new ItemConstraintError();
    throw error;
  }
}

export async function updateItem(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    itemId: string;
    item: ItemInput & { status: "ACTIVE" | "INACTIVE" };
    idempotencyKey: string;
    now?: Date;
  },
): Promise<ItemWriteResult> {
  await requireItemAccess(db, input.context, input.companyId, "write");
  const { status, ...itemData } = input.item;
  const parsed = itemInputSchema.parse(itemData);
  const parsedStatus = z.enum(["ACTIVE", "INACTIVE"]).parse(status);
  const common = writeInput(input);

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: "item.update",
          key: input.idempotencyKey,
          payload: {
            itemId: input.itemId,
            item: parsed,
            status: parsedStatus,
          },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          const existing = await tx.item.findFirst({
            where: {
              id: input.itemId,
              companyRelations: { some: { companyId: input.companyId } },
            },
          });
          if (!existing) throw new ItemNotFoundError();
          const updated = await tx.item.update({
            where: { id: existing.id },
            data: {
              code: parsed.code,
              normalizedCode: normalizeItemCode(parsed.code),
              name: parsed.name,
              description: parsed.description,
              specification: parsed.specification,
              baseUnit: parsed.baseUnit,
              barcode: normalizeBarcode(parsed.barcode),
              itemType: parsed.itemType,
              salesEnabled: parsed.salesEnabled,
              purchaseEnabled: parsed.purchaseEnabled,
              inventoryEnabled: parsed.inventoryEnabled,
              productionEnabled: parsed.productionEnabled,
              status: parsedStatus,
              updatedById: common.userId,
            },
          });
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "item",
            entityId: updated.id,
            operation:
              existing.status !== updated.status
                ? `item.${updated.status === "ACTIVE" ? "activated" : "deactivated"}`
                : "item.updated",
            beforeJson: itemSnapshot(existing),
            afterJson: itemSnapshot(updated),
          });
          return {
            value: { id: updated.id },
            responseStatus: 200,
            responseMetadata: { id: updated.id },
            resultReference: updated.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new ItemConstraintError();
    throw error;
  }
}

export async function assignItemCompany(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    itemId: string;
    relation: ItemCompanyInput;
    idempotencyKey: string;
    now?: Date;
    afterWrite?: (
      tx: Prisma.TransactionClient,
      result: { id: string },
    ) => Promise<void>;
  },
): Promise<ItemWriteResult> {
  await requireItemAccess(db, input.context, input.companyId, "write");
  const parsed = itemCompanyInputSchema.parse(input.relation);
  const common = writeInput(input);

  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: common.userId,
          operation: "item.company.assign",
          key: input.idempotencyKey,
          payload: { itemId: input.itemId, relation: parsed },
          expiresAt: common.expiresAt,
          now: common.now,
        },
        async (tx) => {
          const item = await tx.item.findUnique({
            where: { id: input.itemId },
          });
          if (!item) throw new ItemNotFoundError();
          const existing = await tx.itemCompany.findUnique({
            where: {
              itemId_companyId: {
                itemId: item.id,
                companyId: input.companyId,
              },
            },
          });
          const relation = existing
            ? await tx.itemCompany.update({
                where: { id: existing.id },
                data: {
                  companyItemCode: parsed.companyItemCode,
                  normalizedCompanyItemCode: normalizeItemCode(
                    parsed.companyItemCode,
                  ),
                  salesEnabled: parsed.salesEnabled,
                  status: parsed.status,
                  updatedById: common.userId,
                },
              })
            : await tx.itemCompany.create({
                data: {
                  itemId: item.id,
                  companyId: input.companyId,
                  companyItemCode: parsed.companyItemCode,
                  normalizedCompanyItemCode: normalizeItemCode(
                    parsed.companyItemCode,
                  ),
                  salesEnabled: parsed.salesEnabled,
                  status: parsed.status,
                  createdById: common.userId,
                  updatedById: common.userId,
                },
              });
          const statusChanged = existing && existing.status !== relation.status;
          await writeAudit(tx, {
            ...auditContext(input),
            entityType: "item_company",
            entityId: relation.id,
            operation: !existing
              ? "item_company.created"
              : statusChanged
                ? `item_company.${relation.status === "ACTIVE" ? "activated" : "deactivated"}`
                : "item_company.updated",
            beforeJson: existing ? relationSnapshot(existing) : undefined,
            afterJson: relationSnapshot(relation),
          });
          await input.afterWrite?.(tx, { id: relation.id });
          return {
            value: { id: relation.id },
            responseStatus: existing ? 200 : 201,
            responseMetadata: { id: relation.id },
            resultReference: relation.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) {
      throw new ItemConstraintError("公司品項代碼已被使用");
    }
    throw error;
  }
}
