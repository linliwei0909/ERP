import {
  Prisma,
  type PrismaClient,
  type SalesOrder,
  type SalesOrderLine,
} from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/authorization";
import {
  CompanyAccessError,
  hasCompanyAccess,
} from "@/lib/auth/company-scope";
import type { RequestContext } from "@/lib/auth/session";
import { getCompanyLegalSettings } from "@/lib/company-settings/service";
import { calculateFreight } from "@/lib/freight/service";
import {
  executeIdempotent,
  type IdempotentResult,
} from "@/lib/idempotency";
import {
  addIntegerAmounts,
  addQuantities,
  calculateLineAmount,
  normalizeQuantity,
  normalizeUnitPrice,
} from "@/lib/sales-orders/money";
import {
  assertP31SalesOrderTransition,
  assertSalesOrderVoidTransition,
  canEditSalesOrderDraft,
} from "@/lib/sales-orders/state-machine";
import { voidDeliveryNoteForOrderVoid } from "@/lib/delivery-notes/service";
import {
  formatDateOnly,
  parseDateOnly,
  salesOrderDraftInputSchema,
  salesOrderLineInputSchema,
  salesOrderQuerySchema,
  type SalesOrderDraftInput,
  type SalesOrderLineInput,
} from "@/lib/sales-orders/validation";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const SALES_ORDER_DOCUMENT_TYPE = "SALES_ORDER";

type Tx = Prisma.TransactionClient;
type WriteResult = { id: string; replayed: boolean };

export class SalesOrderNotFoundError extends Error {
  readonly code = "ORDER_NOT_FOUND";
  constructor() {
    super("找不到指定的銷售訂單");
  }
}

export class SalesOrderNotEditableError extends Error {
  readonly code = "ORDER_NOT_EDITABLE";
  constructor(message = "目前狀態的訂單不可編輯") {
    super(message);
  }
}

export class SalesOrderRevisionRequiredError extends Error {
  readonly code = "ORDER_REVISION_REQUIRED";
  constructor() {
    super("已確認訂單必須先開始正式修訂");
  }
}

export class SalesOrderAlreadyVoidedError extends Error {
  readonly code = "ORDER_ALREADY_VOIDED";
  constructor() {
    super("訂單已作廢");
  }
}

export class SalesOrderPrerequisiteError extends Error {
  readonly code = "ORDER_CONFIRMATION_PREREQUISITE_MISSING";
  constructor(message: string) {
    super(message);
  }
}

export class SalesOrderConstraintError extends Error {
  readonly code = "ORDER_CONSTRAINT_CONFLICT";
  constructor(message = "訂單資料違反唯一性或完整性限制") {
    super(message);
  }
}

function requestAuditContext(
  context: RequestContext,
  companyId: string,
) {
  return {
    companyId,
    actorUserId: context.actor.userId,
    sessionId: context.session.sessionId,
    requestId: context.requestId,
  };
}

function assertSalesOrderPermission(
  context: RequestContext,
  companyId: string,
  permission: "sales_orders.read" | "sales_orders.manage",
): void {
  requirePermission(context, permission);
  if (
    !hasCompanyAccess(
      context.authorizedCompanies.map((company) => company.id),
      companyId,
    )
  ) {
    throw new CompanyAccessError();
  }
}

function replayResult(
  result: IdempotentResult<{ id: string }>,
): WriteResult {
  if (result.replayed) {
    if (!result.resultReference) {
      throw new Error("冪等訂單操作缺少結果識別碼");
    }
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
    const code = candidate.code;
    if (typeof code === "string" && /^23[A-Z0-9]{3}$/.test(code)) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

function dateParts(date: Date) {
  return {
    fiscalYear: date.getUTCFullYear(),
    fiscalMonth: date.getUTCMonth() + 1,
  };
}

async function nextSalesOrderNumber(
  tx: Tx,
  input: {
    companyId: string;
    orderDate: Date;
    documentCompanyCode: string;
  },
): Promise<string> {
  const { fiscalYear, fiscalMonth } = dateParts(input.orderDate);
  const rows = await tx.$queryRaw<Array<{ last_value: bigint }>>`
    INSERT INTO "document_sequences" (
      "company_id", "fiscal_year", "fiscal_month", "document_type",
      "last_value", "created_at", "updated_at"
    )
    VALUES (
      ${input.companyId}::uuid, ${fiscalYear}, ${fiscalMonth},
      ${SALES_ORDER_DOCUMENT_TYPE}, 1, now(), now()
    )
    ON CONFLICT (
      "company_id", "fiscal_year", "fiscal_month", "document_type"
    )
    DO UPDATE
       SET "last_value" = "document_sequences"."last_value" + 1,
           "updated_at" = now()
    RETURNING "last_value"
  `;
  const sequence = rows[0]?.last_value;
  if (!sequence || sequence > BigInt(999_999)) {
    throw new SalesOrderConstraintError("當月訂單流水號已超過六碼");
  }
  return `SO-${input.documentCompanyCode}-${fiscalYear}${String(
    fiscalMonth,
  ).padStart(2, "0")}-${sequence.toString().padStart(6, "0")}`;
}

async function lockOrder(
  tx: Tx,
  companyId: string,
  orderId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
      FROM "sales_orders"
     WHERE "id" = ${orderId}::uuid
       AND "company_id" = ${companyId}::uuid
     FOR UPDATE
  `;
  if (!rows[0]) throw new SalesOrderNotFoundError();
}

async function loadOrderTargets(
  tx: Tx,
  input: {
    companyId: string;
    customerId: string;
    deliveryLocationId: string;
    customerContactId?: string | null;
    orderDate: Date;
  },
) {
  const [company, customerCompany, deliveryLocation, requestedContact, legal] =
    await Promise.all([
      tx.company.findFirst({
        where: { id: input.companyId, status: "ACTIVE" },
      }),
      tx.customerCompany.findFirst({
        where: {
          companyId: input.companyId,
          customerId: input.customerId,
          status: "ACTIVE",
          customer: { status: "ACTIVE" },
        },
        include: { customer: true },
      }),
      tx.deliveryLocation.findFirst({
        where: {
          id: input.deliveryLocationId,
          customerId: input.customerId,
          status: "ACTIVE",
        },
      }),
      input.customerContactId
        ? tx.customerContact.findFirst({
            where: {
              id: input.customerContactId,
              customerId: input.customerId,
              status: "ACTIVE",
            },
          })
        : tx.customerContact.findFirst({
            where: {
              customerId: input.customerId,
              status: "ACTIVE",
              isPrimary: true,
            },
          }),
      getCompanyLegalSettings(tx, input.companyId, input.orderDate),
    ]);

  if (!company || !customerCompany) {
    throw new SalesOrderPrerequisiteError(
      "客戶未授權給目前公司或已停用",
    );
  }
  if (!deliveryLocation) {
    throw new SalesOrderPrerequisiteError(
      "送貨地點無效或不屬於指定客戶",
    );
  }
  if (input.customerContactId && !requestedContact) {
    throw new SalesOrderPrerequisiteError(
      "聯絡人無效或不屬於指定客戶",
    );
  }

  const customer = customerCompany.customer;
  return {
    customerId: customer.id,
    contactId: requestedContact?.id ?? null,
    customerSnapshot: {
      customerCode: customerCompany.customerCode,
      name: customer.name,
      customerType: customer.customerType,
      taxId: customer.taxId,
      countryCode: customer.countryCode,
      foreignIdentifier: customer.foreignIdentifier,
    },
    customerCompanySnapshot: {
      customerCompanyId: customerCompany.id,
      companyId: company.id,
      companyCode: company.code,
      customerCode: customerCompany.customerCode,
    },
    contactSnapshot: requestedContact
      ? {
          name: requestedContact.name,
          department: requestedContact.department,
          jobTitle: requestedContact.jobTitle,
          phone: requestedContact.phone,
          mobile: requestedContact.mobile,
          email: requestedContact.email,
        }
      : null,
    deliverySnapshot: {
      code: deliveryLocation.code,
      name: deliveryLocation.name,
      recipientName: deliveryLocation.recipientName,
      phone: deliveryLocation.phone,
      postalCode: deliveryLocation.postalCode,
      city: deliveryLocation.city,
      district: deliveryLocation.district,
      addressLine: deliveryLocation.addressLine,
      fullAddress: deliveryLocation.fullAddress,
    },
    companySnapshot: {
      code: company.code,
      companyName: legal.companyName,
      documentCompanyCode: legal.documentCompanyCode,
      companyTaxId: legal.companyTaxId,
      companyAddress: legal.companyAddress,
      companyPhone: legal.companyPhone,
    },
  };
}

async function findEffectivePrice(
  tx: Tx,
  input: {
    companyId: string;
    customerId: string;
    itemId: string;
    orderDate: Date;
  },
) {
  const assignment = await tx.customerPriceListAssignment.findFirst({
    where: {
      companyId: input.companyId,
      customerId: input.customerId,
      status: "ACTIVE",
      validFrom: { lte: input.orderDate },
      OR: [{ validTo: null }, { validTo: { gt: input.orderDate } }],
      priceList: { status: "ACTIVE" },
    },
    include: { priceList: true },
  });
  if (!assignment) return null;
  const price = await tx.itemPrice.findFirst({
    where: {
      priceListId: assignment.priceListId,
      itemId: input.itemId,
      status: "ACTIVE",
      validFrom: { lte: input.orderDate },
      OR: [{ validTo: null }, { validTo: { gt: input.orderDate } }],
    },
  });
  if (!price) return null;
  return { assignment, price, priceList: assignment.priceList };
}

type ResolvedLine = {
  sourceLineId?: string;
  itemId: string;
  itemSnapshot: Record<string, unknown>;
  priceSnapshot: Record<string, unknown>;
  quantity: string;
  standardUnitPrice: string | null;
  unitPrice: string;
  priceSource: "STANDARD" | "STANDARD_OVERRIDE" | "MANUAL";
  manualPriceReason: string | null;
  priceOverriddenAt: Date | null;
  priceOverriddenById: string | null;
  priceListId: string | null;
  itemPriceId: string | null;
  lineAmount: string;
};

async function resolveLine(
  tx: Tx,
  input: {
    companyId: string;
    customerId: string;
    orderDate: Date;
    actorUserId: string;
    line: SalesOrderLineInput;
    now: Date;
    priorSource?: "STANDARD" | "STANDARD_OVERRIDE" | "MANUAL";
  },
): Promise<ResolvedLine> {
  const parsed = salesOrderLineInputSchema.parse(input.line);
  const quantity = normalizeQuantity(parsed.quantity);
  const itemCompany = await tx.itemCompany.findFirst({
    where: {
      companyId: input.companyId,
      itemId: parsed.itemId,
      status: "ACTIVE",
      salesEnabled: true,
      item: { status: "ACTIVE", salesEnabled: true },
    },
    include: { item: true },
  });
  if (!itemCompany) {
    throw new SalesOrderPrerequisiteError(
      "品項未授權給目前公司、已停用或不可銷售",
    );
  }
  const formal = await findEffectivePrice(tx, {
    companyId: input.companyId,
    customerId: input.customerId,
    itemId: parsed.itemId,
    orderDate: input.orderDate,
  });
  const suppliedPrice =
    parsed.unitPrice === undefined || parsed.unitPrice === null
      ? null
      : normalizeUnitPrice(parsed.unitPrice);
  const reason = parsed.manualPriceReason?.trim() || null;
  const standardPrice = formal
    ? normalizeUnitPrice(formal.price.unitPrice.toFixed(5))
    : null;

  let unitPrice: string;
  let priceSource: ResolvedLine["priceSource"];
  if (formal) {
    if (
      suppliedPrice === null ||
      (input.priorSource === "STANDARD" && suppliedPrice !== standardPrice) ||
      suppliedPrice === standardPrice
    ) {
      unitPrice = standardPrice!;
      priceSource = "STANDARD";
    } else {
      if (!reason) {
        throw new SalesOrderPrerequisiteError(
          "使用不同於標準價的成交價時，人工價格理由必填",
        );
      }
      unitPrice = suppliedPrice;
      priceSource = "STANDARD_OVERRIDE";
    }
  } else {
    if (suppliedPrice === null || !reason) {
      throw new SalesOrderPrerequisiteError(
        "查無正式價格時，成交價與人工價格理由必填",
      );
    }
    unitPrice = suppliedPrice;
    priceSource = "MANUAL";
  }

  const overridden = priceSource !== "STANDARD";
  return {
    sourceLineId: parsed.id,
    itemId: itemCompany.itemId,
    itemSnapshot: {
      code: itemCompany.item.code,
      companyItemCode: itemCompany.companyItemCode,
      name: itemCompany.item.name,
      description: itemCompany.item.description,
      specification: itemCompany.item.specification,
      baseUnit: itemCompany.item.baseUnit,
      itemType: itemCompany.item.itemType,
    },
    priceSnapshot: {
      priceListId: formal?.priceList.id ?? null,
      priceListCode: formal?.priceList.code ?? null,
      itemPriceId: formal?.price.id ?? null,
      standardUnitPrice: standardPrice,
      transactionUnitPrice: unitPrice,
      priceSource,
      manualPriceReason: overridden ? reason : null,
      effectiveDate: formatDateOnly(input.orderDate),
      priceValidFrom: formal ? formatDateOnly(formal.price.validFrom) : null,
      priceValidTo: formal?.price.validTo
        ? formatDateOnly(formal.price.validTo)
        : null,
    },
    quantity,
    standardUnitPrice: standardPrice,
    unitPrice,
    priceSource,
    manualPriceReason: overridden ? reason : null,
    priceOverriddenAt: overridden ? input.now : null,
    priceOverriddenById: overridden ? input.actorUserId : null,
    priceListId: formal?.priceList.id ?? null,
    itemPriceId: formal?.price.id ?? null,
    lineAmount: calculateLineAmount(quantity, unitPrice),
  };
}

async function resolveFreight(
  tx: Tx,
  input: {
    companyId: string;
    customerId: string;
    deliveryLocationId: string;
    orderDate: Date;
    quantity: string;
    required: boolean;
  },
) {
  const rule = await tx.freightRule.findFirst({
    where: {
      companyId: input.companyId,
      customerId: input.customerId,
      deliveryLocationId: input.deliveryLocationId,
      status: "ACTIVE",
      validFrom: { lte: input.orderDate },
      OR: [{ validTo: null }, { validTo: { gt: input.orderDate } }],
    },
  });
  if (!rule) {
    if (input.required) {
      throw new SalesOrderPrerequisiteError(
        "找不到訂單日期有效的運費規則",
      );
    }
    return null;
  }
  const amount = calculateFreight({
    mode: rule.mode,
    quantity: input.quantity,
    unitFreight: rule.unitFreight?.toFixed(0) ?? null,
    fixedFreight: rule.fixedFreight?.toFixed(0) ?? null,
  });
  return {
    rule,
    amount,
    snapshot: {
      freightRuleId: rule.id,
      mode: rule.mode,
      unitFreight: rule.unitFreight?.toFixed(0) ?? null,
      fixedFreight: rule.fixedFreight?.toFixed(0) ?? null,
      calculationQuantity: input.quantity,
      freightAmount: amount,
      effectiveDate: formatDateOnly(input.orderDate),
      validFrom: formatDateOnly(rule.validFrom),
      validTo: rule.validTo ? formatDateOnly(rule.validTo) : null,
    },
  };
}

function orderSnapshot(
  order: SalesOrder,
  lines: SalesOrderLine[] = [],
) {
  return {
    id: order.id,
    companyId: order.companyId,
    orderNumber: order.orderNumber,
    orderDate: formatDateOnly(order.orderDate),
    customerId: order.customerId,
    deliveryLocationId: order.deliveryLocationId,
    customerContactId: order.customerContactId,
    status: order.status,
    revisionNo: order.revisionNo,
    paymentTermsText: order.paymentTermsText,
    subtotal: order.subtotal.toFixed(0),
    freightAmount: order.freightAmount.toFixed(0),
    totalAmount: order.totalAmount.toFixed(0),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    confirmedBy: order.confirmedById,
    voidedAt: order.voidedAt?.toISOString() ?? null,
    voidedBy: order.voidedById,
    voidReason: order.voidReason,
    lines: lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemId: line.itemId,
      quantity: line.quantity.toFixed(4),
      standardUnitPrice: line.standardUnitPrice?.toFixed(5) ?? null,
      unitPrice: line.unitPrice.toFixed(5),
      priceSource: line.priceSource,
      manualPriceReason: line.manualPriceReason,
      lineAmount: line.lineAmount.toFixed(0),
      isActive: line.isActive,
    })),
  };
}

async function replaceDraftContents(
  tx: Tx,
  input: {
    order: SalesOrder;
    draft: SalesOrderDraftInput;
    actorUserId: string;
    now: Date;
    context: RequestContext;
  },
): Promise<SalesOrder> {
  const parsed = salesOrderDraftInputSchema.parse(input.draft);
  const orderDate = parseDateOnly(parsed.orderDate);
  const targets = await loadOrderTargets(tx, {
    companyId: input.order.companyId,
    customerId: parsed.customerId,
    deliveryLocationId: parsed.deliveryLocationId,
    customerContactId: parsed.customerContactId,
    orderDate,
  });
  const existing = await tx.salesOrderLine.findMany({
    where: { salesOrderId: input.order.id },
    orderBy: { lineNumber: "asc" },
  });
  const existingById = new Map(existing.map((line) => [line.id, line]));
  const activeIds = new Set<string>();
  const resolved: ResolvedLine[] = [];

  for (const rawLine of parsed.lines) {
    const prior = rawLine.id ? existingById.get(rawLine.id) : undefined;
    if (rawLine.id && (!prior || !prior.isActive)) {
      throw new SalesOrderPrerequisiteError("訂單明細不存在或已移除");
    }
    if (prior) activeIds.add(prior.id);
    resolved.push(
      await resolveLine(tx, {
        companyId: input.order.companyId,
        customerId: parsed.customerId,
        orderDate,
        actorUserId: input.actorUserId,
        line: rawLine,
        now: input.now,
        priorSource: prior?.priceSource,
      }),
    );
  }

  let nextLineNumber =
    existing.reduce((max, line) => Math.max(max, line.lineNumber), 0) + 1;
  for (const line of resolved) {
    const prior = line.sourceLineId
      ? existingById.get(line.sourceLineId)
      : undefined;
    const data = {
      itemId: line.itemId,
      itemSnapshot: line.itemSnapshot as Prisma.InputJsonValue,
      priceSnapshot: line.priceSnapshot as Prisma.InputJsonValue,
      quantity: line.quantity,
      standardUnitPrice: line.standardUnitPrice,
      unitPrice: line.unitPrice,
      priceSource: line.priceSource,
      manualPriceReason: line.manualPriceReason,
      priceOverriddenAt: line.priceOverriddenAt,
      priceOverriddenById: line.priceOverriddenById,
      priceListId: line.priceListId,
      itemPriceId: line.itemPriceId,
      lineAmount: line.lineAmount,
      updatedById: input.actorUserId,
    };
    if (prior) {
      const updated = await tx.salesOrderLine.update({
        where: { id: prior.id },
        data,
      });
      await writeAudit(tx, {
        ...requestAuditContext(input.context, input.order.companyId),
        entityType: "sales_order_line",
        entityId: updated.id,
        operation: "sales_order.line_updated",
        beforeJson: orderSnapshot(input.order, [prior]).lines[0],
        afterJson: orderSnapshot(input.order, [updated]).lines[0],
      });
    } else {
      const created = await tx.salesOrderLine.create({
        data: {
          salesOrderId: input.order.id,
          companyId: input.order.companyId,
          lineNumber: nextLineNumber++,
          ...data,
          createdById: input.actorUserId,
        },
      });
      activeIds.add(created.id);
      await writeAudit(tx, {
        ...requestAuditContext(input.context, input.order.companyId),
        entityType: "sales_order_line",
        entityId: created.id,
        operation: "sales_order.line_added",
        afterJson: orderSnapshot(input.order, [created]).lines[0],
      });
    }
  }

  for (const prior of existing.filter(
    (line) => line.isActive && !activeIds.has(line.id),
  )) {
    const removed = await tx.salesOrderLine.update({
      where: { id: prior.id },
      data: {
        isActive: false,
        removedAt: input.now,
        removedById: input.actorUserId,
        updatedById: input.actorUserId,
      },
    });
    await writeAudit(tx, {
      ...requestAuditContext(input.context, input.order.companyId),
      entityType: "sales_order_line",
      entityId: prior.id,
      operation: "sales_order.line_removed",
      beforeJson: orderSnapshot(input.order, [prior]).lines[0],
      afterJson: orderSnapshot(input.order, [removed]).lines[0],
    });
  }

  const subtotal = addIntegerAmounts(resolved.map((line) => line.lineAmount));
  const totalQuantity =
    resolved.length > 0
      ? addQuantities(resolved.map((line) => line.quantity))
      : "0";
  const freight =
    resolved.length > 0
      ? await resolveFreight(tx, {
          companyId: input.order.companyId,
          customerId: parsed.customerId,
          deliveryLocationId: parsed.deliveryLocationId,
          orderDate,
          quantity: totalQuantity,
          required: false,
        })
      : null;
  const freightAmount = freight?.amount ?? "0";

  return tx.salesOrder.update({
    where: { id: input.order.id },
    data: {
      orderDate,
      customerId: parsed.customerId,
      deliveryLocationId: parsed.deliveryLocationId,
      customerContactId: targets.contactId,
      customerSnapshot: targets.customerSnapshot,
      customerCompanySnapshot: targets.customerCompanySnapshot,
      contactSnapshot: targets.contactSnapshot ?? Prisma.DbNull,
      deliverySnapshot: targets.deliverySnapshot,
      companySnapshot: targets.companySnapshot,
      paymentTermsText: parsed.paymentTermsText,
      subtotal,
      freightRuleId: freight?.rule.id ?? null,
      freightMode: freight?.rule.mode ?? null,
      freightSnapshot: freight?.snapshot ?? Prisma.DbNull,
      freightAmount,
      totalAmount: addIntegerAmounts([subtotal, freightAmount]),
      updatedById: input.actorUserId,
    },
  });
}

export async function createSalesOrderDraft(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    draft: SalesOrderDraftInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.manage",
  );
  const parsed = salesOrderDraftInputSchema.parse(input.draft);
  const now = input.now ?? new Date();
  try {
    return replayResult(
      await executeIdempotent(
        db,
        {
          companyId: input.companyId,
          userId: input.context.actor.userId,
          operation: "sales_order.create",
          key: input.idempotencyKey,
          payload: parsed,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          now,
        },
        async (tx) => {
          const orderDate = parseDateOnly(parsed.orderDate);
          const targets = await loadOrderTargets(tx, {
            companyId: input.companyId,
            customerId: parsed.customerId,
            deliveryLocationId: parsed.deliveryLocationId,
            customerContactId: parsed.customerContactId,
            orderDate,
          });
          const orderNumber = await nextSalesOrderNumber(tx, {
            companyId: input.companyId,
            orderDate,
            documentCompanyCode:
              targets.companySnapshot.documentCompanyCode,
          });
          const { fiscalYear, fiscalMonth } = dateParts(orderDate);
          let order = await tx.salesOrder.create({
            data: {
              companyId: input.companyId,
              fiscalYear,
              fiscalMonth,
              orderNumber,
              orderDate,
              customerId: parsed.customerId,
              deliveryLocationId: parsed.deliveryLocationId,
              customerContactId: targets.contactId,
              customerSnapshot: targets.customerSnapshot,
              customerCompanySnapshot:
                targets.customerCompanySnapshot,
              contactSnapshot: targets.contactSnapshot ?? Prisma.DbNull,
              deliverySnapshot: targets.deliverySnapshot,
              companySnapshot: targets.companySnapshot,
              paymentTermsText: parsed.paymentTermsText,
              createdById: input.context.actor.userId,
              updatedById: input.context.actor.userId,
            },
          });
          order = await replaceDraftContents(tx, {
            order,
            draft: parsed,
            actorUserId: input.context.actor.userId,
            now,
            context: input.context,
          });
          const lines = await tx.salesOrderLine.findMany({
            where: { salesOrderId: order.id, isActive: true },
          });
          await writeAudit(tx, {
            ...requestAuditContext(input.context, input.companyId),
            entityType: "sales_order",
            entityId: order.id,
            operation: "sales_order.created",
            afterJson: orderSnapshot(order, lines),
          });
          return {
            value: { id: order.id },
            responseStatus: 201,
            responseMetadata: {
              id: order.id,
              orderNumber: order.orderNumber,
            },
            resultReference: order.id,
          };
        },
      ),
    );
  } catch (error) {
    if (isConstraintError(error)) throw new SalesOrderConstraintError();
    throw error;
  }
}

export async function updateSalesOrderDraft(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    orderId: string;
    draft: SalesOrderDraftInput;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.manage",
  );
  const parsed = salesOrderDraftInputSchema.parse(input.draft);
  const now = input.now ?? new Date();
  return replayResult(
    await executeIdempotent(
      db,
      {
        companyId: input.companyId,
        userId: input.context.actor.userId,
        operation: "sales_order.update",
        key: input.idempotencyKey,
        payload: { orderId: input.orderId, draft: parsed },
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        now,
      },
      async (tx) => {
        await lockOrder(tx, input.companyId, input.orderId);
        const before = await tx.salesOrder.findUniqueOrThrow({
          where: { id: input.orderId },
          include: { lines: true },
        });
        if (before.status === "CONFIRMED") {
          throw new SalesOrderRevisionRequiredError();
        }
        if (!canEditSalesOrderDraft(before.status)) {
          if (before.status === "VOIDED") {
            throw new SalesOrderAlreadyVoidedError();
          }
          throw new SalesOrderNotEditableError();
        }
        const updated = await replaceDraftContents(tx, {
          order: before,
          draft: parsed,
          actorUserId: input.context.actor.userId,
          now,
          context: input.context,
        });
        const lines = await tx.salesOrderLine.findMany({
          where: { salesOrderId: updated.id, isActive: true },
        });
        await writeAudit(tx, {
          ...requestAuditContext(input.context, input.companyId),
          entityType: "sales_order",
          entityId: updated.id,
          operation: "sales_order.updated",
          beforeJson: orderSnapshot(before, before.lines),
          afterJson: orderSnapshot(updated, lines),
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
}

export async function confirmSalesOrder(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    orderId: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.manage",
  );
  const now = input.now ?? new Date();
  return replayResult(
    await executeIdempotent(
      db,
      {
        companyId: input.companyId,
        userId: input.context.actor.userId,
        operation: "sales_order.confirm",
        key: input.idempotencyKey,
        payload: { orderId: input.orderId },
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        now,
      },
      async (tx) => {
        await lockOrder(tx, input.companyId, input.orderId);
        const before = await tx.salesOrder.findUniqueOrThrow({
          where: { id: input.orderId },
          include: {
            lines: {
              where: { isActive: true },
              orderBy: { lineNumber: "asc" },
            },
          },
        });
        assertP31SalesOrderTransition(before.status, "CONFIRMED");
        if (before.lines.length === 0) {
          throw new SalesOrderPrerequisiteError(
            "訂單至少需要一筆有效明細",
          );
        }
        const targets = await loadOrderTargets(tx, {
          companyId: input.companyId,
          customerId: before.customerId,
          deliveryLocationId: before.deliveryLocationId,
          customerContactId: before.customerContactId,
          orderDate: before.orderDate,
        });
        const resolved: ResolvedLine[] = [];
        for (const line of before.lines) {
          resolved.push(
            await resolveLine(tx, {
              companyId: input.companyId,
              customerId: before.customerId,
              orderDate: before.orderDate,
              actorUserId: input.context.actor.userId,
              now,
              priorSource: line.priceSource,
              line: {
                id: line.id,
                itemId: line.itemId,
                quantity: line.quantity.toFixed(4),
                unitPrice: line.unitPrice.toFixed(5),
                manualPriceReason: line.manualPriceReason,
              },
            }),
          );
        }
        const subtotal = addIntegerAmounts(
          resolved.map((line) => line.lineAmount),
        );
        const totalQuantity = addQuantities(
          resolved.map((line) => line.quantity),
        );
        const freight = await resolveFreight(tx, {
          companyId: input.companyId,
          customerId: before.customerId,
          deliveryLocationId: before.deliveryLocationId,
          orderDate: before.orderDate,
          quantity: totalQuantity,
          required: true,
        });
        if (!freight) {
          throw new SalesOrderPrerequisiteError("缺少有效運費規則");
        }
        for (let index = 0; index < resolved.length; index += 1) {
          const current = before.lines[index]!;
          const line = resolved[index]!;
          const updatedLine = await tx.salesOrderLine.update({
            where: { id: current.id },
            data: {
              itemSnapshot: line.itemSnapshot as Prisma.InputJsonValue,
              priceSnapshot: line.priceSnapshot as Prisma.InputJsonValue,
              quantity: line.quantity,
              standardUnitPrice: line.standardUnitPrice,
              unitPrice: line.unitPrice,
              priceSource: line.priceSource,
              manualPriceReason: line.manualPriceReason,
              priceOverriddenAt: line.priceOverriddenAt,
              priceOverriddenById: line.priceOverriddenById,
              priceListId: line.priceListId,
              itemPriceId: line.itemPriceId,
              lineAmount: line.lineAmount,
              updatedById: input.context.actor.userId,
            },
          });
          if (line.priceSource !== "STANDARD") {
            await writeAudit(tx, {
              ...requestAuditContext(input.context, input.companyId),
              entityType: "sales_order_line",
              entityId: current.id,
              operation:
                line.priceSource === "MANUAL"
                  ? "sales_order.manual_price_used"
                  : "sales_order.standard_price_overridden",
              reason: line.manualPriceReason,
              beforeJson: orderSnapshot(before, [current]).lines[0],
              afterJson: orderSnapshot(before, [updatedLine]).lines[0],
            });
          }
        }
        const updated = await tx.salesOrder.update({
          where: { id: before.id },
          data: {
            status: "CONFIRMED",
            customerContactId: targets.contactId,
            customerSnapshot: targets.customerSnapshot,
            customerCompanySnapshot:
              targets.customerCompanySnapshot,
            contactSnapshot: targets.contactSnapshot ?? Prisma.DbNull,
            deliverySnapshot: targets.deliverySnapshot,
            companySnapshot: targets.companySnapshot,
            subtotal,
            freightRuleId: freight.rule.id,
            freightMode: freight.rule.mode,
            freightSnapshot: freight.snapshot,
            freightAmount: freight.amount,
            totalAmount: addIntegerAmounts([subtotal, freight.amount]),
            confirmedAt: now,
            confirmedById: input.context.actor.userId,
            updatedById: input.context.actor.userId,
          },
        });
        const updatedLines = await tx.salesOrderLine.findMany({
          where: { salesOrderId: before.id, isActive: true },
        });
        await writeAudit(tx, {
          ...requestAuditContext(input.context, input.companyId),
          entityType: "sales_order",
          entityId: updated.id,
          operation: "sales_order.confirmed",
          beforeJson: orderSnapshot(before, before.lines),
          afterJson: orderSnapshot(updated, updatedLines),
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
}

export async function startSalesOrderRevision(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    orderId: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.manage",
  );
  const now = input.now ?? new Date();
  return replayResult(
    await executeIdempotent(
      db,
      {
        companyId: input.companyId,
        userId: input.context.actor.userId,
        operation: "sales_order.revision_start",
        key: input.idempotencyKey,
        payload: { orderId: input.orderId },
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        now,
      },
      async (tx) => {
        await lockOrder(tx, input.companyId, input.orderId);
        const before = await tx.salesOrder.findUniqueOrThrow({
          where: { id: input.orderId },
          include: { lines: true },
        });
        assertP31SalesOrderTransition(before.status, "DRAFT");
        const updated = await tx.salesOrder.update({
          where: { id: before.id },
          data: {
            status: "DRAFT",
            revisionNo: { increment: 1 },
            confirmedAt: null,
            confirmedById: null,
            updatedById: input.context.actor.userId,
          },
        });
        await writeAudit(tx, {
          ...requestAuditContext(input.context, input.companyId),
          entityType: "sales_order",
          entityId: updated.id,
          operation: "sales_order.revision_started",
          beforeJson: orderSnapshot(before, before.lines),
          afterJson: orderSnapshot(updated, before.lines),
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
}

export async function voidSalesOrder(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    orderId: string;
    reason: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WriteResult> {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.manage",
  );
  const reason = input.reason.trim();
  if (!reason) {
    throw new SalesOrderPrerequisiteError("作廢理由必填");
  }
  const now = input.now ?? new Date();
  return replayResult(
    await executeIdempotent(
      db,
      {
        companyId: input.companyId,
        userId: input.context.actor.userId,
        operation: "sales_order.void_with_delivery_note",
        key: input.idempotencyKey,
        payload: { orderId: input.orderId, reason },
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        now,
      },
      async (tx) => {
        await lockOrder(tx, input.companyId, input.orderId);
        const before = await tx.salesOrder.findUniqueOrThrow({
          where: { id: input.orderId },
          include: { lines: true },
        });
        if (before.status === "VOIDED") {
          throw new SalesOrderAlreadyVoidedError();
        }
        assertSalesOrderVoidTransition(before.status);
        const voidedDeliveryNoteId = await voidDeliveryNoteForOrderVoid(tx, {
          context: input.context,
          companyId: input.companyId,
          salesOrderId: before.id,
          now,
        });
        const updated = await tx.salesOrder.update({
          where: { id: before.id },
          data: {
            status: "VOIDED",
            voidedAt: now,
            voidedById: input.context.actor.userId,
            voidReason: reason,
            updatedById: input.context.actor.userId,
          },
        });
        await writeAudit(tx, {
          ...requestAuditContext(input.context, input.companyId),
          entityType: "sales_order",
          entityId: updated.id,
          operation: "sales_order.voided",
          reason,
          beforeJson: orderSnapshot(before, before.lines),
          afterJson: orderSnapshot(updated, before.lines),
          metadata: { voidedDeliveryNoteId },
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
}

export async function getSalesOrder(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    orderId: string;
  },
) {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.read",
  );
  const order = await db.salesOrder.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
      sourceRelations: true,
      relatedRelations: true,
    },
  });
  if (!order) throw new SalesOrderNotFoundError();
  return order;
}

export async function listSalesOrders(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    query?: unknown;
  },
) {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.read",
  );
  const query = salesOrderQuerySchema.parse(input.query ?? {});
  const where: Prisma.SalesOrderWhereInput = {
    companyId: input.companyId,
    ...(query.status === "ALL" ? {} : { status: query.status }),
    ...(query.search
      ? {
          OR: [
            {
              orderNumber: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            {
              customerSnapshot: {
                path: ["name"],
                string_contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
  const [total, orders] = await db.$transaction([
    db.salesOrder.count({ where }),
    db.salesOrder.findMany({
      where,
      include: {
        lines: { where: { isActive: true }, orderBy: { lineNumber: "asc" } },
      },
      orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    orders,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function previewSalesOrderPricing(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    orderDate: string;
    lines: SalesOrderLineInput[];
  },
) {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.read",
  );
  const orderDate = parseDateOnly(input.orderDate);
  return db.$transaction(async (tx) =>
    Promise.all(
      input.lines.map((line) =>
        resolveLine(tx, {
          companyId: input.companyId,
          customerId: input.customerId,
          orderDate,
          actorUserId: input.context.actor.userId,
          line,
          now: new Date(),
        }),
      ),
    ),
  );
}

export async function previewSalesOrderFreight(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    customerId: string;
    deliveryLocationId: string;
    orderDate: string;
    quantities: Array<string | number>;
  },
) {
  assertSalesOrderPermission(
    input.context,
    input.companyId,
    "sales_orders.read",
  );
  const quantity = addQuantities(
    input.quantities.map((value) => normalizeQuantity(value)),
  );
  return db.$transaction(async (tx) =>
    resolveFreight(tx, {
      companyId: input.companyId,
      customerId: input.customerId,
      deliveryLocationId: input.deliveryLocationId,
      orderDate: parseDateOnly(input.orderDate),
      quantity,
      required: true,
    }),
  );
}

export async function addSalesOrderLine(
  db: PrismaClient,
  input: Parameters<typeof updateSalesOrderDraft>[1],
) {
  return updateSalesOrderDraft(db, input);
}

export async function updateSalesOrderLine(
  db: PrismaClient,
  input: Parameters<typeof updateSalesOrderDraft>[1],
) {
  return updateSalesOrderDraft(db, input);
}

export async function removeSalesOrderLine(
  db: PrismaClient,
  input: Parameters<typeof updateSalesOrderDraft>[1],
) {
  return updateSalesOrderDraft(db, input);
}
