import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { authenticateCredentials } from "../src/lib/auth/authentication";
import { CompanyAccessError } from "../src/lib/auth/company-scope";
import {
  getSessionContext,
  revokeCurrentSession,
  type RequestContext,
} from "../src/lib/auth/session";
import {
  assignCustomerCompany,
  createCustomer,
  saveCustomerContact,
  saveDeliveryLocation,
} from "../src/lib/customers/service";
import {
  assignItemCompany,
  createItem,
} from "../src/lib/items/service";
import {
  createItemPriceVersion,
  createPriceAssignment,
  createPriceList,
} from "../src/lib/pricing/service";
import { createFreightRule } from "../src/lib/freight/service";
import {
  confirmSalesOrder,
  createSalesOrderDraft,
  SalesOrderPrerequisiteError,
  startSalesOrderRevision,
  voidSalesOrder,
} from "../src/lib/sales-orders/service";
import { salesOrderDraftInputSchema } from "../src/lib/sales-orders/validation";
import { getCompanyLegalSettings } from "../src/lib/company-settings/service";
import { getServerEnv } from "../src/lib/env";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少必要環境變數：${name}`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectRejected(
  action: () => Promise<unknown>,
  description: string,
  expected?: new (...args: never[]) => Error,
) {
  try {
    await action();
  } catch (error) {
    if (expected && !(error instanceof expected)) {
      throw error;
    }
    return;
  }
  throw new Error(`預期拒絕但操作成功：${description}`);
}

const databaseUrl = required("DATABASE_URL");
const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
if (databaseName !== "erp") {
  throw new Error(`P3.1 smoke test 只允許 erp，目前為 ${databaseName}`);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const env = getServerEnv();
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const marker = `P31-SMOKE-${runId}`;
const orderDate = "2026-07-27";
const nextMonthDate = "2026-08-01";
let sessionToken: string | undefined;

function key(label: string) {
  return `${marker}-${label}`;
}

async function getSalesOrderSequenceLastValue(
  companyId: string,
  fiscalMonth: number,
): Promise<bigint> {
  const sequence = await db.documentSequence.findFirst({
    where: {
      companyId,
      fiscalYear: 2026,
      fiscalMonth,
      documentType: "SALES_ORDER",
    },
    select: { lastValue: true },
  });
  return sequence?.lastValue ?? BigInt(0);
}

function contextFor(
  context: RequestContext,
  companyCode: "INDUSTRIAL" | "BIOTECH",
): RequestContext {
  const selectedCompany = context.authorizedCompanies.find(
    (company) => company.code === companyCode,
  );
  assert(selectedCompany, `管理員缺少 ${companyCode} 公司權限`);
  return {
    ...context,
    selectedCompany,
    requestId: `${marker}-${companyCode}`,
  };
}

async function main() {
  const auth = await authenticateCredentials(
    db,
    {
      username: required("BOOTSTRAP_ADMIN_USERNAME"),
      password: required("BOOTSTRAP_ADMIN_PASSWORD"),
      requestId: `${marker}-login`,
      clientMetadata: { purpose: "P3.1 smoke test" },
    },
    {
      maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
      lockMinutes: env.AUTH_LOCK_MINUTES,
    },
  );
  assert(auth.ok, "P3.1 smoke test 管理員登入失敗");
  sessionToken = auth.token;

  const baseContext = await getSessionContext(db, auth.token, {
    activityThrottleMinutes: env.SESSION_ACTIVITY_THROTTLE_MINUTES,
    requestId: `${marker}-context`,
  });
  const industrial = contextFor(baseContext, "INDUSTRIAL");
  const biotech = contextFor(baseContext, "BIOTECH");
  assert(industrial.selectedCompany && biotech.selectedCompany, "公司 context 不完整");

  const industrialSettings = await getCompanyLegalSettings(
    db,
    industrial.selectedCompany.id,
    new Date(`${orderDate}T00:00:00.000Z`),
  );
  const biotechSettings = await getCompanyLegalSettings(
    db,
    biotech.selectedCompany.id,
    new Date(`${orderDate}T00:00:00.000Z`),
  );
  assert(
    industrialSettings.documentCompanyCode === "IN" &&
      biotechSettings.documentCompanyCode === "BI",
    "公司單據碼解析錯誤",
  );

  const customer = await createCustomer(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    customerCode: `${marker}-IN`,
    customer: {
      customerType: "DOMESTIC",
      name: `${marker} 測試客戶`,
    },
    idempotencyKey: key("customer"),
  });
  await assignCustomerCompany(db, {
    context: biotech,
    companyId: biotech.selectedCompany.id,
    customerId: customer.id,
    relation: {
      customerCode: `${marker}-BI`,
      status: "ACTIVE",
    },
    idempotencyKey: key("customer-biotech"),
  });
  const contact = await saveCustomerContact(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    customerId: customer.id,
    contact: {
      name: `${marker} 聯絡人`,
      phone: "02-00000000",
      isPrimary: true,
      status: "ACTIVE",
    },
    idempotencyKey: key("contact"),
  });
  const location = await saveDeliveryLocation(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    customerId: customer.id,
    location: {
      code: `${marker}-MAIN`,
      name: `${marker} 送貨點`,
      recipientName: `${marker} 收貨人`,
      phone: "02-00000000",
      city: "新北市",
      district: "中和區",
      addressLine: "P3.1 smoke test address",
      isDefault: true,
      status: "ACTIVE",
    },
    idempotencyKey: key("location"),
  });
  const noFreightLocation = await saveDeliveryLocation(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    customerId: customer.id,
    location: {
      code: `${marker}-NO-FREIGHT`,
      name: `${marker} 無運費規則地點`,
      recipientName: `${marker} 收貨人`,
      phone: "02-00000000",
      addressLine: "P3.1 smoke test no freight",
      status: "ACTIVE",
    },
    idempotencyKey: key("location-no-freight"),
  });

  const pricedItem = await createItem(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    item: {
      code: `${marker}-ITEM`,
      name: `${marker} 正式價格品項`,
      description: "P3.1 smoke test data",
      specification: "SMOKE",
      baseUnit: "PCS",
      itemType: "PRODUCT",
      salesEnabled: true,
      purchaseEnabled: false,
      inventoryEnabled: false,
      productionEnabled: false,
    },
    companyRelation: {
      companyItemCode: `${marker}-ITEM-IN`,
      salesEnabled: true,
      status: "ACTIVE",
    },
    idempotencyKey: key("item"),
  });
  await assignItemCompany(db, {
    context: biotech,
    companyId: biotech.selectedCompany.id,
    itemId: pricedItem.id,
    relation: {
      companyItemCode: `${marker}-ITEM-BI`,
      salesEnabled: true,
      status: "ACTIVE",
    },
    idempotencyKey: key("item-biotech"),
  });
  const manualItem = await createItem(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    item: {
      code: `${marker}-MANUAL`,
      name: `${marker} 人工價格品項`,
      baseUnit: "PCS",
      itemType: "PRODUCT",
      salesEnabled: true,
      purchaseEnabled: false,
      inventoryEnabled: false,
      productionEnabled: false,
    },
    companyRelation: {
      companyItemCode: `${marker}-MANUAL-IN`,
      salesEnabled: true,
      status: "ACTIVE",
    },
    idempotencyKey: key("manual-item"),
  });

  for (const context of [industrial, biotech]) {
    assert(context.selectedCompany, "公司 context 不完整");
    const priceList = await createPriceList(db, {
      context,
      companyId: context.selectedCompany.id,
      priceList: {
        code: `${marker}-${context.selectedCompany.code}`,
        name: `${marker} ${context.selectedCompany.code} 價格表`,
      },
      idempotencyKey: key(`price-list-${context.selectedCompany.code}`),
    });
    await createItemPriceVersion(db, {
      context,
      companyId: context.selectedCompany.id,
      priceListId: priceList.id,
      price: {
        itemId: pricedItem.id,
        unitPrice: "100",
        validFrom: "2026-01-01",
        status: "ACTIVE",
      },
      idempotencyKey: key(`item-price-${context.selectedCompany.code}`),
    });
    await createPriceAssignment(db, {
      context,
      companyId: context.selectedCompany.id,
      assignment: {
        customerId: customer.id,
        priceListId: priceList.id,
        validFrom: "2026-01-01",
        status: "ACTIVE",
      },
      idempotencyKey: key(`price-assignment-${context.selectedCompany.code}`),
    });
    await createFreightRule(db, {
      context,
      companyId: context.selectedCompany.id,
      freightRule: {
        customerId: customer.id,
        deliveryLocationId: location.id,
        mode: "NO_CHARGE",
        unitFreight: null,
        fixedFreight: null,
        validFrom: "2026-01-01",
        status: "ACTIVE",
      },
      idempotencyKey: key(`freight-${context.selectedCompany.code}`),
    });
  }

  const standardDraft = {
    orderDate,
    customerId: customer.id,
    deliveryLocationId: location.id,
    customerContactId: contact.id,
    paymentTermsText: "P3.1 smoke test",
    lines: [{ itemId: pricedItem.id, quantity: "2" }],
  };
  const standardKey = key("order-standard");
  const industrialJulyBefore = await getSalesOrderSequenceLastValue(
    industrial.selectedCompany.id,
    7,
  );
  const biotechJulyBefore = await getSalesOrderSequenceLastValue(
    biotech.selectedCompany.id,
    7,
  );
  const industrialAugustBefore = await getSalesOrderSequenceLastValue(
    industrial.selectedCompany.id,
    8,
  );
  const standard = await createSalesOrderDraft(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    draft: standardDraft,
    idempotencyKey: standardKey,
  });
  assert(
    (await getSalesOrderSequenceLastValue(
      industrial.selectedCompany.id,
      7,
    )) ===
      industrialJulyBefore + BigInt(1) &&
      (await getSalesOrderSequenceLastValue(
        biotech.selectedCompany.id,
        7,
      )) === biotechJulyBefore &&
      (await getSalesOrderSequenceLastValue(
        industrial.selectedCompany.id,
        8,
      )) === industrialAugustBefore,
    "INDUSTRIAL 2026/07 建單後必須只增加該公司及月份的流水號",
  );
  const standardReplay = await createSalesOrderDraft(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    draft: standardDraft,
    idempotencyKey: standardKey,
  });
  assert(
    standardReplay.id === standard.id && standardReplay.replayed,
    "建立訂單 idempotency replay 失敗",
  );

  const biotechOrder = await createSalesOrderDraft(db, {
    context: biotech,
    companyId: biotech.selectedCompany.id,
    draft: standardDraft,
    idempotencyKey: key("order-biotech"),
  });
  assert(
    (await getSalesOrderSequenceLastValue(
      industrial.selectedCompany.id,
      7,
    )) ===
      industrialJulyBefore + BigInt(1) &&
      (await getSalesOrderSequenceLastValue(
        biotech.selectedCompany.id,
        7,
      )) ===
        biotechJulyBefore + BigInt(1) &&
      (await getSalesOrderSequenceLastValue(
        industrial.selectedCompany.id,
        8,
      )) === industrialAugustBefore,
    "BIOTECH 2026/07 建單後必須只增加該公司及月份的流水號",
  );
  const nextMonthOrder = await createSalesOrderDraft(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    draft: { ...standardDraft, orderDate: nextMonthDate },
    idempotencyKey: key("order-next-month"),
  });
  assert(
    (await getSalesOrderSequenceLastValue(
      industrial.selectedCompany.id,
      7,
    )) ===
      industrialJulyBefore + BigInt(1) &&
      (await getSalesOrderSequenceLastValue(
        biotech.selectedCompany.id,
        7,
      )) ===
        biotechJulyBefore + BigInt(1) &&
      (await getSalesOrderSequenceLastValue(
        industrial.selectedCompany.id,
        8,
      )) ===
        industrialAugustBefore + BigInt(1),
    "INDUSTRIAL 2026/08 建單後必須只增加該公司及月份的流水號",
  );

  const [standardRow, biotechRow, nextMonthRow] = await Promise.all([
    db.salesOrder.findUniqueOrThrow({ where: { id: standard.id } }),
    db.salesOrder.findUniqueOrThrow({ where: { id: biotechOrder.id } }),
    db.salesOrder.findUniqueOrThrow({ where: { id: nextMonthOrder.id } }),
  ]);
  assert(
    standardRow.orderNumber ===
      `SO-IN-202607-${(industrialJulyBefore + BigInt(1)).toString().padStart(6, "0")}`,
    "INDUSTRIAL 2026/07 訂單號未依建立前流水號正確增加",
  );
  assert(
    biotechRow.orderNumber ===
      `SO-BI-202607-${(biotechJulyBefore + BigInt(1)).toString().padStart(6, "0")}`,
    "BIOTECH 2026/07 訂單號未依建立前流水號正確增加",
  );
  assert(
    nextMonthRow.orderNumber ===
      `SO-IN-202608-${(industrialAugustBefore + BigInt(1)).toString().padStart(6, "0")}`,
    "INDUSTRIAL 2026/08 訂單號未依建立前流水號正確增加",
  );

  for (const forgedField of ["orderNumber", "documentCompanyCode"] as const) {
    const forged = { ...standardDraft, [forgedField]: "FORGED" };
    let rejected = false;
    try {
      salesOrderDraftInputSchema.parse(forged);
    } catch {
      rejected = true;
    }
    assert(rejected, `偽造 ${forgedField} 未被 validation 拒絕`);
  }

  const confirmKey = key("confirm-standard");
  await confirmSalesOrder(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: standard.id,
    idempotencyKey: confirmKey,
  });
  const confirmReplay = await confirmSalesOrder(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: standard.id,
    idempotencyKey: confirmKey,
  });
  assert(confirmReplay.replayed, "確認 idempotency replay 失敗");

  const confirmed = await db.salesOrder.findUniqueOrThrow({
    where: { id: standard.id },
    include: { lines: { where: { isActive: true } } },
  });
  assert(confirmed.status === "CONFIRMED", "STANDARD 訂單未確認");
  assert(confirmed.lines[0]?.priceSource === "STANDARD", "STANDARD 價格來源錯誤");
  const companySnapshot = confirmed.companySnapshot as Record<string, unknown>;
  assert(
    companySnapshot.documentCompanyCode === "IN" &&
      companySnapshot.companyName === "奇麗實業有限公司" &&
      companySnapshot.companyTaxId === "60603347" &&
      companySnapshot.companyAddress === "新北市中和區國光街109巷22弄13號" &&
      companySnapshot.companyPhone === "02-29571175",
    "公司 snapshot 不完整",
  );
  assert(
    Object.keys(confirmed.customerSnapshot as object).length > 0 &&
      Object.keys(confirmed.customerCompanySnapshot as object).length > 0 &&
      Object.keys(confirmed.deliverySnapshot as object).length > 0 &&
      Object.keys(confirmed.lines[0]!.itemSnapshot as object).length > 0 &&
      Object.keys(confirmed.lines[0]!.priceSnapshot as object).length > 0 &&
      confirmed.freightSnapshot &&
      Object.keys(confirmed.freightSnapshot as object).length > 0,
    "確認後 snapshot 不完整",
  );

  const override = await createSalesOrderDraft(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    draft: {
      ...standardDraft,
      lines: [
        {
          itemId: pricedItem.id,
          quantity: "1",
          unitPrice: "90",
          manualPriceReason: "P3.1 smoke standard override",
        },
      ],
    },
    idempotencyKey: key("order-override"),
  });
  await confirmSalesOrder(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: override.id,
    idempotencyKey: key("confirm-override"),
  });
  const overrideLine = await db.salesOrderLine.findFirstOrThrow({
    where: { salesOrderId: override.id, isActive: true },
  });
  assert(overrideLine.priceSource === "STANDARD_OVERRIDE", "改價來源錯誤");
  await expectRejected(
    () =>
      createSalesOrderDraft(db, {
        context: industrial,
        companyId: industrial.selectedCompany!.id,
        draft: {
          ...standardDraft,
          lines: [{ itemId: pricedItem.id, quantity: "1", unitPrice: "90" }],
        },
        idempotencyKey: key("override-no-reason"),
      }),
    "正式價改價未填理由",
    SalesOrderPrerequisiteError,
  );

  const manual = await createSalesOrderDraft(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    draft: {
      ...standardDraft,
      lines: [
        {
          itemId: manualItem.id,
          quantity: "1",
          unitPrice: "55",
          manualPriceReason: "P3.1 smoke missing formal price",
        },
      ],
    },
    idempotencyKey: key("order-manual"),
  });
  await confirmSalesOrder(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: manual.id,
    idempotencyKey: key("confirm-manual"),
  });
  const manualLine = await db.salesOrderLine.findFirstOrThrow({
    where: { salesOrderId: manual.id, isActive: true },
  });
  assert(manualLine.priceSource === "MANUAL", "MANUAL 價格來源錯誤");
  await expectRejected(
    () =>
      createSalesOrderDraft(db, {
        context: industrial,
        companyId: industrial.selectedCompany!.id,
        draft: {
          ...standardDraft,
          lines: [{ itemId: manualItem.id, quantity: "1", unitPrice: "55" }],
        },
        idempotencyKey: key("manual-no-reason"),
      }),
    "人工價格未填理由",
    SalesOrderPrerequisiteError,
  );
  const noFreight = await createSalesOrderDraft(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    draft: { ...standardDraft, deliveryLocationId: noFreightLocation.id },
    idempotencyKey: key("no-freight"),
  });
  const noFreightBefore = await db.salesOrder.findUniqueOrThrow({
    where: { id: noFreight.id },
    include: {
      lines: {
        where: { isActive: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  assert(
    noFreightBefore.status === "DRAFT" &&
      noFreightBefore.confirmedAt === null &&
      noFreightBefore.confirmedById === null,
    "缺少運費規則的訂單必須先成功建立為未確認草稿",
  );
  const noFreightStateBeforeConfirmation = JSON.stringify({
    customerSnapshot: noFreightBefore.customerSnapshot,
    customerCompanySnapshot: noFreightBefore.customerCompanySnapshot,
    contactSnapshot: noFreightBefore.contactSnapshot,
    deliverySnapshot: noFreightBefore.deliverySnapshot,
    companySnapshot: noFreightBefore.companySnapshot,
    subtotal: noFreightBefore.subtotal.toString(),
    freightRuleId: noFreightBefore.freightRuleId,
    freightMode: noFreightBefore.freightMode,
    freightSnapshot: noFreightBefore.freightSnapshot,
    freightAmount: noFreightBefore.freightAmount.toString(),
    totalAmount: noFreightBefore.totalAmount.toString(),
    lines: noFreightBefore.lines.map((line) => ({
      itemSnapshot: line.itemSnapshot,
      priceSnapshot: line.priceSnapshot,
      standardUnitPrice: line.standardUnitPrice?.toString() ?? null,
      unitPrice: line.unitPrice.toString(),
      priceSource: line.priceSource,
      manualPriceReason: line.manualPriceReason,
      lineAmount: line.lineAmount.toString(),
    })),
  });
  const confirmedAuditCountBefore = await db.auditLog.count({
    where: {
      entityId: noFreight.id,
      operation: "sales_order.confirmed",
    },
  });
  const noFreightConfirmationKey = key("confirm-no-freight");
  let missingFreightError: unknown;
  try {
    await confirmSalesOrder(db, {
      context: industrial,
      companyId: industrial.selectedCompany.id,
      orderId: noFreight.id,
      idempotencyKey: noFreightConfirmationKey,
    });
  } catch (error) {
    missingFreightError = error;
  }
  assert(
    missingFreightError instanceof SalesOrderPrerequisiteError,
    "缺少運費規則時確認訂單必須回傳 SalesOrderPrerequisiteError",
  );
  assert(
    missingFreightError.code === "ORDER_CONFIRMATION_PREREQUISITE_MISSING" &&
      missingFreightError.message === "找不到訂單日期有效的運費規則",
    "缺少運費規則時必須回傳明確且一致的確認前置條件錯誤",
  );
  const noFreightAfter = await db.salesOrder.findUniqueOrThrow({
    where: { id: noFreight.id },
    include: {
      lines: {
        where: { isActive: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  assert(
    noFreightAfter.status === "DRAFT" &&
      noFreightAfter.confirmedAt === null &&
      noFreightAfter.confirmedById === null,
    "缺少運費規則的確認失敗後訂單必須維持未確認草稿",
  );
  assert(
    JSON.stringify({
      customerSnapshot: noFreightAfter.customerSnapshot,
      customerCompanySnapshot: noFreightAfter.customerCompanySnapshot,
      contactSnapshot: noFreightAfter.contactSnapshot,
      deliverySnapshot: noFreightAfter.deliverySnapshot,
      companySnapshot: noFreightAfter.companySnapshot,
      subtotal: noFreightAfter.subtotal.toString(),
      freightRuleId: noFreightAfter.freightRuleId,
      freightMode: noFreightAfter.freightMode,
      freightSnapshot: noFreightAfter.freightSnapshot,
      freightAmount: noFreightAfter.freightAmount.toString(),
      totalAmount: noFreightAfter.totalAmount.toString(),
      lines: noFreightAfter.lines.map((line) => ({
        itemSnapshot: line.itemSnapshot,
        priceSnapshot: line.priceSnapshot,
        standardUnitPrice: line.standardUnitPrice?.toString() ?? null,
        unitPrice: line.unitPrice.toString(),
        priceSource: line.priceSource,
        manualPriceReason: line.manualPriceReason,
        lineAmount: line.lineAmount.toString(),
      })),
    }) === noFreightStateBeforeConfirmation,
    "缺少運費規則的確認失敗不得更新訂單或明細快照",
  );
  assert(
    (await db.auditLog.count({
      where: {
        entityId: noFreight.id,
        operation: "sales_order.confirmed",
      },
    })) === confirmedAuditCountBefore,
    "缺少運費規則的確認失敗不得建立 sales_order.confirmed audit",
  );
  const failedConfirmationIdempotency = await db.idempotencyKey.findFirst({
    where: {
      companyId: industrial.selectedCompany.id,
      operation: "sales_order.confirm",
      idempotencyKey: noFreightConfirmationKey,
    },
  });
  assert(
    failedConfirmationIdempotency?.status === "FAILED",
    "缺少運費規則的確認失敗必須依既有流程記錄 FAILED idempotency",
  );
  const prohibitedTablesAfterFailedConfirmation = await db.$queryRaw<
    Array<{ table_name: string }>
  >`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'delivery_notes',
         'delivery_note_lines',
         'receivables',
         'inventory',
         'warehouses',
         'lots',
         'procurement',
         'accounting_postings'
       )
  `;
  assert(
    prohibitedTablesAfterFailedConfirmation.length === 0,
    "缺少運費規則的確認失敗不得建立禁止範圍資料表",
  );

  const snapshotsBeforeRevision = JSON.stringify({
    company: confirmed.companySnapshot,
    customer: confirmed.customerSnapshot,
    item: confirmed.lines[0]!.itemSnapshot,
  });
  const revisionKey = key("revision-standard");
  await startSalesOrderRevision(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: standard.id,
    idempotencyKey: revisionKey,
  });
  const revisionReplay = await startSalesOrderRevision(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: standard.id,
    idempotencyKey: revisionKey,
  });
  assert(revisionReplay.replayed, "修訂 idempotency replay 失敗");
  const revised = await db.salesOrder.findUniqueOrThrow({
    where: { id: standard.id },
    include: { lines: { where: { isActive: true } } },
  });
  assert(revised.status === "DRAFT" && revised.revisionNo === 2, "修訂狀態錯誤");
  assert(
    JSON.stringify({
      company: revised.companySnapshot,
      customer: revised.customerSnapshot,
      item: revised.lines[0]!.itemSnapshot,
    }) === snapshotsBeforeRevision,
    "開始修訂時不應刷新 snapshot",
  );
  await expectRejected(
    () =>
      voidSalesOrder(db, {
        context: industrial,
        companyId: industrial.selectedCompany!.id,
        orderId: nextMonthOrder.id,
        reason: " ",
        idempotencyKey: key("void-no-reason"),
      }),
    "作廢未填理由",
  );
  const voidKey = key("void-standard");
  await voidSalesOrder(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: standard.id,
    reason: "P3.1 smoke test completed",
    idempotencyKey: voidKey,
  });
  const voidReplay = await voidSalesOrder(db, {
    context: industrial,
    companyId: industrial.selectedCompany.id,
    orderId: standard.id,
    reason: "P3.1 smoke test completed",
    idempotencyKey: voidKey,
  });
  assert(voidReplay.replayed, "作廢 idempotency replay 失敗");

  const forgedScope: RequestContext = {
    ...industrial,
    authorizedCompanies: [industrial.selectedCompany],
  };
  await expectRejected(
    () =>
      createSalesOrderDraft(db, {
        context: forgedScope,
        companyId: biotech.selectedCompany!.id,
        draft: standardDraft,
        idempotencyKey: key("forged-company"),
      }),
    "未授權公司操作",
    CompanyAccessError,
  );

  const auditOperations = await db.auditLog.groupBy({
    by: ["operation"],
    where: {
      entityId: {
        in: [standard.id, override.id, manual.id],
      },
    },
    _count: { _all: true },
  });
  for (const operation of [
    "sales_order.created",
    "sales_order.confirmed",
    "sales_order.revision_started",
    "sales_order.voided",
  ]) {
    assert(
      auditOperations.some((entry) => entry.operation === operation),
      `缺少 audit operation：${operation}`,
    );
  }

  const prohibitedTables = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'delivery_notes',
         'delivery_note_lines',
         'receivables',
         'inventory',
         'warehouses',
         'lots',
         'procurement',
         'accounting_postings'
       )
  `;
  assert(prohibitedTables.length === 0, "發現禁止資料表");

  console.log(
    JSON.stringify(
      {
        marker,
        retainedTestData: true,
        companies: {
          INDUSTRIAL: industrial.selectedCompany.code,
          BIOTECH: biotech.selectedCompany.code,
        },
        orders: {
          industrial: standardRow.orderNumber,
          biotech: biotechRow.orderNumber,
          nextMonth: nextMonthRow.orderNumber,
          override: override.id,
          manual: manual.id,
        },
        snapshots: "verified",
        auditOperations: auditOperations.map((entry) => ({
          operation: entry.operation,
          count: entry._count._all,
        })),
        prohibitedTables: prohibitedTables.length,
      },
      null,
      2,
    ),
  );
}

async function run(): Promise<void> {
  try {
    await main();
  } finally {
    if (sessionToken) {
      await revokeCurrentSession(
        db,
        sessionToken,
        "p3_1_smoke_completed",
        new Date(),
        `${marker}-logout`,
      );
    }
    await db.$disconnect();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "未知錯誤";
  console.error(`P3.1 smoke test 失敗：${message}`);
  process.exitCode = 1;
});
