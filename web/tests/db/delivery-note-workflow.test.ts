import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  GET as getDeliveryNoteRoute,
} from "../../src/app/api/delivery-notes/[id]/route";
import {
  POST as adminVoidDeliveryNoteRoute,
} from "../../src/app/api/delivery-notes/[id]/void/route";
import {
  GET as listDeliveryNotesRoute,
} from "../../src/app/api/delivery-notes/route";
import {
  GET as getCurrentDeliveryNoteRoute,
  POST as createDeliveryNoteRoute,
} from "../../src/app/api/sales-orders/[id]/delivery-note/route";
import {
  POST as rebuildDeliveryNoteRoute,
} from "../../src/app/api/sales-orders/[id]/delivery-note/rebuild/route";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/constants";
import { hashSessionToken } from "../../src/lib/auth/session-token";
import type { RequestContext } from "../../src/lib/auth/session";
import {
  adminVoidDeliveryNote,
  createDeliveryNoteFromOrder,
  getCurrentDeliveryNoteForOrder,
  getDeliveryNote,
  listDeliveryNotes,
  rebuildDeliveryNoteForOrder,
} from "../../src/lib/delivery-notes/service";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteAdminVoidNotAllowedError,
  DeliveryNoteAlreadyExistsError,
  DeliveryNoteDownstreamLockedError,
  DeliveryNoteIdempotencyConflictError,
  DeliveryNoteInvariantError,
  DeliveryNotePrerequisiteError,
  DeliveryNoteRebuildNotAllowedError,
  DeliveryNoteRebuildRequiredError,
  DeliveryNoteVoidReasonRequiredError,
} from "../../src/lib/delivery-notes/errors";
import {
  confirmSalesOrder,
  startSalesOrderRevision,
  voidSalesOrder,
} from "../../src/lib/sales-orders/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P3.2b/P3.2c delivery-note workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyA: { id: string; code: string; name: string };
  let companyB: { id: string; code: string; name: string };
  let contextA: RequestContext;
  let contextBoth: RequestContext;
  let adminContext: RequestContext;
  let noScopeAdminContext: RequestContext;
  let noPermissionContext: RequestContext;
  let customerId: string;
  let deliveryLocationId: string;
  let itemId: string;
  let userId: string;
  let orderCounter = 0;
  let documentCodeA: string;
  let documentCodeB: string;
  let adminSessionToken: string;
  let orderEntrySessionToken: string;

  beforeAll(async () => {
    [companyA, companyB] = await Promise.all([
      db.company.create({
        data: { code: `DNA-${suffix}`, name: "銷貨單測試公司 A" },
      }),
      db.company.create({
        data: { code: `DNB-${suffix}`, name: "銷貨單測試公司 B" },
      }),
    ]);
    const role = await db.role.upsert({
      where: { code: "ORDER_ENTRY" },
      update: {},
      create: { code: "ORDER_ENTRY", name: "訂單輸入人員" },
    });
    const adminRole = await db.role.upsert({
      where: { code: "ADMIN" },
      update: {},
      create: { code: "ADMIN", name: "系統管理員" },
    });
    const user = await db.user.create({
      data: {
        username: `delivery-note-${suffix}`,
        normalizedUsername: `delivery-note-${suffix}`,
        passwordHash: "test",
        defaultCompanyId: companyA.id,
      },
    });
    userId = user.id;
    await Promise.all([
      db.userRole.create({ data: { userId, roleId: role.id } }),
      db.userRole.create({ data: { userId, roleId: adminRole.id } }),
      db.userCompanyScope.create({
        data: { userId, companyId: companyA.id },
      }),
      db.userCompanyScope.create({
        data: { userId, companyId: companyB.id },
      }),
    ]);
    adminSessionToken = `delivery-note-admin-${randomUUID()}`;
    const session = await db.userSession.create({
      data: {
        userId,
        tokenHash: hashSessionToken(adminSessionToken),
        selectedCompanyId: companyA.id,
      },
    });
    const orderEntryUser = await db.user.create({
      data: {
        username: `delivery-note-order-entry-${suffix}`,
        normalizedUsername: `delivery-note-order-entry-${suffix}`,
        passwordHash: "test",
        defaultCompanyId: companyA.id,
      },
    });
    orderEntrySessionToken = `delivery-note-order-entry-${randomUUID()}`;
    await Promise.all([
      db.userRole.create({
        data: { userId: orderEntryUser.id, roleId: role.id },
      }),
      db.userCompanyScope.create({
        data: { userId: orderEntryUser.id, companyId: companyA.id },
      }),
      db.userSession.create({
        data: {
          userId: orderEntryUser.id,
          tokenHash: hashSessionToken(orderEntrySessionToken),
          selectedCompanyId: companyA.id,
        },
      }),
    ]);
    const baseContext = {
      actor: { userId, username: user.username },
      session: { sessionId: session.id },
      requestId: `delivery-note-${suffix}`,
      roleCodes: ["ORDER_ENTRY"],
    };
    contextA = {
      ...baseContext,
      authorizedCompanies: [companyA],
      selectedCompany: companyA,
    };
    contextBoth = {
      ...baseContext,
      authorizedCompanies: [companyA, companyB],
      selectedCompany: companyA,
    };
    adminContext = {
      ...baseContext,
      roleCodes: ["ADMIN"],
      authorizedCompanies: [companyA, companyB],
      selectedCompany: companyA,
    };
    noScopeAdminContext = {
      ...adminContext,
      authorizedCompanies: [companyB],
      selectedCompany: companyB,
    };
    noPermissionContext = {
      ...contextA,
      roleCodes: [],
    };

    const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");
    const existingDocumentCodes = new Set(
      (
        await db.companySetting.findMany({
          where: { settingKey: "document_company_code" },
          select: { settingValue: true },
        })
      )
        .map((setting) => setting.settingValue)
        .filter((value): value is string => typeof value === "string"),
    );
    const availableDocumentCodes: string[] = [];
    for (const first of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      for (const second of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        const code = `${first}${second}`;
        if (
          !["IN", "BI", "TA"].includes(code) &&
          !existingDocumentCodes.has(code)
        ) {
          availableDocumentCodes.push(code);
        }
        if (availableDocumentCodes.length === 2) break;
      }
      if (availableDocumentCodes.length === 2) break;
    }
    documentCodeA = availableDocumentCodes[0] ?? "";
    documentCodeB = availableDocumentCodes[1] ?? "";
    if (!documentCodeA || !documentCodeB) {
      throw new Error("找不到可用的測試單據公司碼");
    }
    await db.companySetting.createMany({
      data: [
        ...legalSettings(companyA.id, documentCodeA, effectiveFrom),
        ...legalSettings(companyB.id, documentCodeB, effectiveFrom),
      ],
    });
    const customer = await db.customer.create({
      data: {
        customerType: "DOMESTIC",
        name: `銷貨單客戶 ${suffix}`,
        taxId: `DN-${suffix}`,
        normalizedTaxId: `DN-${suffix}`,
        createdById: userId,
        updatedById: userId,
      },
    });
    customerId = customer.id;
    await Promise.all(
      [companyA, companyB].map((company) =>
        db.customerCompany.create({
          data: {
            customerId,
            companyId: company.id,
            customerCode: `C-${company.code}`,
            normalizedCustomerCode: `C-${company.code}`.toUpperCase(),
            createdById: userId,
            updatedById: userId,
          },
        }),
      ),
    );
    const location = await db.deliveryLocation.create({
      data: {
        customerId,
        code: `DN-${suffix}`,
        name: "銷貨單送貨點",
        recipientName: "收貨人",
        phone: "02-00000000",
        addressLine: "確認時地址",
        fullAddress: "新北市確認時地址",
        createdById: userId,
        updatedById: userId,
      },
    });
    deliveryLocationId = location.id;
    const item = await db.item.create({
      data: {
        code: `DN-ITEM-${suffix}`,
        normalizedCode: `DN-ITEM-${suffix}`,
        name: "確認時品項",
        baseUnit: "PCS",
        itemType: "PRODUCT",
        salesEnabled: true,
        createdById: userId,
        updatedById: userId,
      },
    });
    itemId = item.id;
    await Promise.all(
      [companyA, companyB].map((company) =>
        db.itemCompany.create({
          data: {
            itemId,
            companyId: company.id,
            companyItemCode: `I-${company.code}`,
            normalizedCompanyItemCode: `I-${company.code}`.toUpperCase(),
            salesEnabled: true,
            createdById: userId,
            updatedById: userId,
          },
        }),
      ),
    );
    await Promise.all(
      [companyA, companyB].map((company) =>
        db.freightRule.create({
          data: {
            customerId,
            companyId: company.id,
            deliveryLocationId,
            mode: "FIXED_PER_LOCATION",
            fixedFreight: "2",
            validFrom: effectiveFrom,
            createdById: userId,
            updatedById: userId,
          },
        }),
      ),
    );
  });

  afterAll(async () => db.$disconnect());

  function legalSettings(
    companyId: string,
    documentCompanyCode: string,
    effectiveFrom: Date,
  ) {
    return [
      ["company_name", `測試公司 ${documentCompanyCode}`],
      ["document_company_code", documentCompanyCode],
      [
        "company_tax_id",
        documentCompanyCode === documentCodeA ? "11111111" : "22222222",
      ],
      ["company_address", "測試地址"],
      ["company_phone", "02-12345678"],
    ].map(([settingKey, settingValue]) => ({
      companyId,
      settingKey,
      settingValue,
      effectiveFrom,
    }));
  }

  function apiRequest(
    path: string,
    sessionToken?: string,
    options: {
      method?: string;
      body?: unknown;
      idempotencyKey?: string;
      requestId?: string;
    } = {},
  ) {
    return new NextRequest(`http://localhost${path}`, {
      method: options.method ?? "GET",
      headers: {
        origin: "http://localhost",
        "x-request-id": options.requestId ?? `api-${randomUUID()}`,
        ...(sessionToken
          ? {
              cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
            }
          : {}),
        ...(options.idempotencyKey
          ? { "idempotency-key": options.idempotencyKey }
          : {}),
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }

  async function createConfirmedOrder(
    company: { id: string; code: string; name: string },
    overrides: {
      status?: "DRAFT" | "CONFIRMED";
      revisionNo?: number;
      subtotal?: string;
      lineAmount?: string;
    } = {},
  ) {
    orderCounter += 1;
    const status = overrides.status ?? "CONFIRMED";
    const revisionNo = overrides.revisionNo ?? 1;
    const subtotal = overrides.subtotal ?? "10";
    const freightRule = await db.freightRule.findFirstOrThrow({
      where: { companyId: company.id, customerId },
    });
    const order = await db.salesOrder.create({
      data: {
        companyId: company.id,
        fiscalYear: 2026,
        fiscalMonth: 7,
        orderNumber: `SO-${
          company.id === companyA.id ? documentCodeA : documentCodeB
        }-202607-${String(orderCounter).padStart(6, "0")}`,
        orderDate: new Date("2026-07-27T00:00:00.000Z"),
        customerId,
        deliveryLocationId,
        status,
        revisionNo,
        customerSnapshot: {
          name: "確認時客戶",
          taxId: "12345678",
        },
        customerCompanySnapshot: {
          customerCode: "CONFIRMED-CODE",
        },
        contactSnapshot: {
          name: "確認時聯絡人",
          phone: "02-00000000",
        },
        deliverySnapshot: {
          fullAddress: "新北市確認時地址",
        },
        companySnapshot: {
          companyName: "確認時公司",
          documentCompanyCode:
            company.id === companyA.id ? documentCodeA : documentCodeB,
        },
        paymentTermsText: "月結 30 天",
        freightRuleId: freightRule.id,
        freightMode: "FIXED_PER_LOCATION",
        freightSnapshot: {
          mode: "FIXED_PER_LOCATION",
          freightAmount: "2",
        },
        subtotal,
        freightAmount: "2",
        totalAmount: (BigInt(subtotal) + BigInt(2)).toString(),
        confirmedAt:
          status === "CONFIRMED"
            ? new Date("2026-07-27T01:00:00.000Z")
            : null,
        confirmedById: status === "CONFIRMED" ? userId : null,
        createdById: userId,
        updatedById: userId,
      },
    });
    const line = await db.salesOrderLine.create({
      data: {
        salesOrderId: order.id,
        companyId: company.id,
        lineNumber: 1,
        itemId,
        itemSnapshot: {
          code: "CONFIRMED-ITEM",
          name: "確認時品項",
          baseUnit: "PCS",
        },
        priceSnapshot: {
          priceSource: "MANUAL",
          transactionUnitPrice: "10.00000",
        },
        quantity: "1.0000",
        standardUnitPrice: null,
        unitPrice: "10.00000",
        priceSource: "MANUAL",
        manualPriceReason: "測試人工價格",
        priceOverriddenAt: new Date("2026-07-27T01:00:00.000Z"),
        priceOverriddenById: userId,
        lineAmount: overrides.lineAmount ?? "10",
        createdById: userId,
        updatedById: userId,
      },
    });
    return { ...order, lines: [line] };
  }

  async function prepareConfirmedRevision(
    context: RequestContext = contextA,
  ) {
    const order = await createConfirmedOrder(companyA);
    const old = await createDeliveryNoteFromOrder(db, {
      context,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: randomUUID(),
      now: new Date("2026-07-27T03:00:00.000Z"),
    });
    await startSalesOrderRevision(db, {
      context,
      companyId: companyA.id,
      orderId: order.id,
      idempotencyKey: randomUUID(),
      now: new Date("2026-07-27T04:00:00.000Z"),
    });
    const draft = await db.salesOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(draft).toMatchObject({
      status: "DRAFT",
      revisionNo: 2,
      confirmedAt: null,
      confirmedById: null,
    });
    expect(
      await db.deliveryNote.findUniqueOrThrow({
        where: { id: old.deliveryNote.id },
      }),
    ).toMatchObject({
      status: "ACTIVE",
      salesOrderRevisionNo: 1,
    });
    await confirmSalesOrder(db, {
      context,
      companyId: companyA.id,
      orderId: order.id,
      idempotencyKey: randomUUID(),
      now: new Date("2026-07-27T05:00:00.000Z"),
    });
    return { orderId: order.id, old: old.deliveryNote };
  }

  it("creates ACTIVE lines from confirmed snapshots and replays without new number or audit", async () => {
    const order = await createConfirmedOrder(companyA);
    await Promise.all([
      db.customer.update({
        where: { id: customerId },
        data: { name: "主檔後改客戶" },
      }),
      db.item.update({
        where: { id: itemId },
        data: { name: "主檔後改品項" },
      }),
      db.freightRule.updateMany({
        where: { companyId: companyA.id },
        data: { fixedFreight: "999" },
      }),
    ]);
    const key = randomUUID();
    const first = await createDeliveryNoteFromOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: key,
      now: new Date("2026-07-27T03:00:00.000Z"),
    });
    const replay = await createDeliveryNoteFromOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: key,
      now: new Date("2026-07-27T04:00:00.000Z"),
    });
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(first.deliveryNote.status).toBe("ACTIVE");
    expect(first.deliveryNote.deliveryNoteNumber).toMatch(
      new RegExp(`^DN-${documentCodeA}-202607-\\d{6}$`),
    );
    expect(first.deliveryNote.customerSnapshot).toMatchObject({
      name: "確認時客戶",
    });
    expect(first.deliveryNote.lines[0]?.itemSnapshot).toMatchObject({
      name: "確認時品項",
    });
    expect(first.deliveryNote.freightAmount).toBe("2");
    expect(
      await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: "DELIVERY_CREATED", revisionNo: 1 });
    expect(
      await db.auditLog.count({
        where: {
          OR: [
            {
              entityId: first.deliveryNote.id,
              operation: "delivery_note.created",
            },
            {
              entityId: order.id,
              operation: "sales_order.delivery_created",
            },
          ],
        },
      }),
    ).toBe(2);
  });

  it("rejects invalid status, inconsistent amounts and unauthorized access", async () => {
    const draft = await createConfirmedOrder(companyA, { status: "DRAFT" });
    await expect(
      createDeliveryNoteFromOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: draft.id,
        expectedRevisionNo: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNotePrerequisiteError);

    const inconsistent = await createConfirmedOrder(companyA, {
      subtotal: "11",
      lineAmount: "10",
    });
    await expect(
      createDeliveryNoteFromOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: inconsistent.id,
        expectedRevisionNo: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteInvariantError);

    const authorizedOrder = await createConfirmedOrder(companyA);
    await expect(
      createDeliveryNoteFromOrder(db, {
        context: noPermissionContext,
        companyId: companyA.id,
        salesOrderId: authorizedOrder.id,
        expectedRevisionNo: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);
    await expect(
      createDeliveryNoteFromOrder(db, {
        context: contextA,
        companyId: companyB.id,
        salesOrderId: authorizedOrder.id,
        expectedRevisionNo: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);
  });

  it("conflicts the same idempotency key with a different payload", async () => {
    const order = await createConfirmedOrder(companyA);
    const key = randomUUID();
    await createDeliveryNoteFromOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: key,
    });
    await expect(
      createDeliveryNoteFromOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: order.id,
        expectedRevisionNo: 2,
        idempotencyKey: key,
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteIdempotencyConflictError);
  });

  it("serializes two different keys for one order and creates only one current note", async () => {
    const order = await createConfirmedOrder(companyA);
    const results = await Promise.allSettled(
      [randomUUID(), randomUUID()].map((idempotencyKey) =>
        createDeliveryNoteFromOrder(db, {
          context: contextA,
          companyId: companyA.id,
          salesOrderId: order.id,
          expectedRevisionNo: 1,
          idempotencyKey,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toBeDefined();
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
      DeliveryNoteAlreadyExistsError,
    );
    expect(
      await db.deliveryNote.count({
        where: { salesOrderId: order.id, status: { not: "VOIDED" } },
      }),
    ).toBe(1);
  });

  it("isolates company sequences and uses company code settings", async () => {
    const [orderA, orderB] = await Promise.all([
      createConfirmedOrder(companyA),
      createConfirmedOrder(companyB),
    ]);
    const [noteA, noteB] = await Promise.all([
      createDeliveryNoteFromOrder(db, {
        context: contextBoth,
        companyId: companyA.id,
        salesOrderId: orderA.id,
        expectedRevisionNo: 1,
        idempotencyKey: randomUUID(),
      }),
      createDeliveryNoteFromOrder(db, {
        context: contextBoth,
        companyId: companyB.id,
        salesOrderId: orderB.id,
        expectedRevisionNo: 1,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(noteA.deliveryNote.deliveryNoteNumber).toMatch(
      new RegExp(`^DN-${documentCodeA}-202607-`),
    );
    expect(noteB.deliveryNote.deliveryNoteNumber).toMatch(
      new RegExp(`^DN-${documentCodeB}-202607-`),
    );
    const sequences = await db.documentSequence.findMany({
      where: {
        companyId: { in: [companyA.id, companyB.id] },
        documentType: "DELIVERY_NOTE",
        fiscalYear: 2026,
        fiscalMonth: 7,
      },
    });
    expect(sequences).toHaveLength(2);
  });

  it("provides scoped detail, deterministic list and current-note queries", async () => {
    const order = await createConfirmedOrder(companyA);
    const created = await createDeliveryNoteFromOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: randomUUID(),
    });
    expect(
      await getDeliveryNote(db, {
        context: contextA,
        companyId: companyA.id,
        deliveryNoteId: created.deliveryNote.id,
      }),
    ).toEqual(created.deliveryNote);
    expect(
      (
        await listDeliveryNotes(db, {
          context: contextA,
          companyId: companyA.id,
          filters: {
            salesOrderId: order.id,
            page: 1,
            pageSize: 1,
          },
        })
      ).deliveryNotes,
    ).toHaveLength(1);
    expect(
      await getCurrentDeliveryNoteForOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: order.id,
      }),
    ).toMatchObject({ id: created.deliveryNote.id });
    await expect(
      getDeliveryNote(db, {
        context: contextA,
        companyId: companyB.id,
        deliveryNoteId: created.deliveryNote.id,
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);
  });

  it("voids an ACTIVE note atomically when its order is voided", async () => {
    const order = await createConfirmedOrder(companyA);
    const created = await createDeliveryNoteFromOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: randomUUID(),
    });
    await voidSalesOrder(db, {
      context: contextA,
      companyId: companyA.id,
      orderId: order.id,
      reason: "客戶取消訂單",
      idempotencyKey: randomUUID(),
    });
    expect(
      await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: "VOIDED" });
    expect(
      await db.deliveryNote.findUniqueOrThrow({
        where: { id: created.deliveryNote.id },
      }),
    ).toMatchObject({
      status: "VOIDED",
      voidSource: "ORDER_VOID",
      voidReason: "Sales order voided",
      voidedById: userId,
    });
    expect(
      await getCurrentDeliveryNoteForOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: order.id,
      }),
    ).toBeNull();
  });

  it("leaves a failed idempotency record and no partial delivery note", async () => {
    const draft = await createConfirmedOrder(companyA, { status: "DRAFT" });
    const key = randomUUID();
    await expect(
      createDeliveryNoteFromOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: draft.id,
        expectedRevisionNo: 1,
        idempotencyKey: key,
      }),
    ).rejects.toBeInstanceOf(DeliveryNotePrerequisiteError);
    expect(
      await db.deliveryNote.count({ where: { salesOrderId: draft.id } }),
    ).toBe(0);
    expect(
      await db.idempotencyKey.findUniqueOrThrow({
        where: {
          companyId_operation_idempotencyKey: {
            companyId: companyA.id,
            operation: "delivery_note.create",
            idempotencyKey: key,
          },
        },
      }),
    ).toMatchObject({ status: "FAILED" });
  });

  it("rolls back header, lines, order, audit and sequence when a line insert fails", async () => {
    const order = await createConfirmedOrder(companyA);
    const key = randomUUID();
    const sequenceBefore = await db.documentSequence.findUnique({
      where: {
        companyId_fiscalYear_fiscalMonth_documentType: {
          companyId: companyA.id,
          fiscalYear: 2026,
          fiscalMonth: 7,
          documentType: "DELIVERY_NOTE",
        },
      },
    });
    const deliveryAuditBefore = await db.auditLog.count({
      where: {
        companyId: companyA.id,
        entityType: "delivery_note",
        operation: "delivery_note.created",
      },
    });
    const orderAuditBefore = await db.auditLog.count({
      where: {
        entityId: order.id,
        operation: "sales_order.delivery_created",
      },
    });
    await db.$executeRawUnsafe(`
      CREATE FUNCTION "test_p32b_reject_delivery_note_line"()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'P3.2b atomic rollback test'
          USING ERRCODE = '23514';
      END;
      $$;
      CREATE TRIGGER "test_p32b_reject_delivery_note_line"
      BEFORE INSERT ON "delivery_note_lines"
      FOR EACH ROW
      EXECUTE FUNCTION "test_p32b_reject_delivery_note_line"();
    `);
    try {
      await expect(
        createDeliveryNoteFromOrder(db, {
          context: contextA,
          companyId: companyA.id,
          salesOrderId: order.id,
          expectedRevisionNo: 1,
          idempotencyKey: key,
        }),
      ).rejects.toThrow("P3.2b atomic rollback test");
    } finally {
      await db.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS "test_p32b_reject_delivery_note_line"
          ON "delivery_note_lines";
        DROP FUNCTION IF EXISTS "test_p32b_reject_delivery_note_line"();
      `);
    }
    expect(
      await db.deliveryNote.count({ where: { salesOrderId: order.id } }),
    ).toBe(0);
    expect(
      await db.deliveryNoteLine.count({
        where: { salesOrderLineId: order.lines[0]!.id },
      }),
    ).toBe(0);
    expect(
      await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: "CONFIRMED" });
    expect(
      await db.auditLog.count({
        where: {
          companyId: companyA.id,
          entityType: "delivery_note",
          operation: "delivery_note.created",
        },
      }),
    ).toBe(deliveryAuditBefore);
    expect(
      await db.auditLog.count({
        where: {
          entityId: order.id,
          operation: "sales_order.delivery_created",
        },
      }),
    ).toBe(orderAuditBefore);
    expect(
      await db.idempotencyKey.findUniqueOrThrow({
        where: {
          companyId_operation_idempotencyKey: {
            companyId: companyA.id,
            operation: "delivery_note.create",
            idempotencyKey: key,
          },
        },
      }),
    ).toMatchObject({ status: "FAILED" });
    const sequenceAfter = await db.documentSequence.findUnique({
      where: {
        companyId_fiscalYear_fiscalMonth_documentType: {
          companyId: companyA.id,
          fiscalYear: 2026,
          fiscalMonth: 7,
          documentType: "DELIVERY_NOTE",
        },
      },
    });
    expect(sequenceAfter?.lastValue ?? BigInt(0)).toBe(
      sequenceBefore?.lastValue ?? BigInt(0),
    );
  });

  it("keeps the old note through revision and atomically rebuilds with stable replay", async () => {
    const prepared = await prepareConfirmedRevision();
    const oldBefore = await getDeliveryNote(db, {
      context: contextA,
      companyId: companyA.id,
      deliveryNoteId: prepared.old.id,
    });
    await expect(
      createDeliveryNoteFromOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: prepared.orderId,
        expectedRevisionNo: 2,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteRebuildRequiredError);

    const key = randomUUID();
    const rebuilt = await rebuildDeliveryNoteForOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: prepared.orderId,
      expectedRevisionNo: 2,
      reason: "訂單修訂後重建",
      idempotencyKey: key,
      now: new Date("2026-07-28T03:00:00.000Z"),
    });
    const replay = await rebuildDeliveryNoteForOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: prepared.orderId,
      expectedRevisionNo: 2,
      reason: "訂單修訂後重建",
      idempotencyKey: key,
      // 明確落在首次請求的 idempotency TTL 內，避免測試到期邊界語意。
      now: new Date("2026-07-28T03:05:00.000Z"),
    });
    expect(rebuilt.replayed).toBe(false);
    expect(replay).toEqual({ ...rebuilt, replayed: true });
    expect(rebuilt.deliveryNote).toMatchObject({
      status: "ACTIVE",
      salesOrderRevisionNo: 2,
      replacedDeliveryNoteId: prepared.old.id,
    });
    expect(rebuilt.deliveryNote.deliveryNoteNumber).not.toBe(
      prepared.old.deliveryNoteNumber,
    );
    const oldAfter = await getDeliveryNote(db, {
      context: contextA,
      companyId: companyA.id,
      deliveryNoteId: prepared.old.id,
    });
    expect(oldAfter).toMatchObject({
      status: "VOIDED",
      voidSource: "ORDER_REVISION_REBUILD",
      replacementDeliveryNoteId: rebuilt.deliveryNote.id,
    });
    expect(oldAfter.customerSnapshot).toEqual(oldBefore.customerSnapshot);
    expect(oldAfter.lines).toEqual(oldBefore.lines);
    expect(rebuilt.deliveryNote.replacedDeliveryNote).toMatchObject({
      id: prepared.old.id,
      status: "VOIDED",
      salesOrderRevisionNo: 1,
    });
    expect(
      await db.salesOrder.findUniqueOrThrow({
        where: { id: prepared.orderId },
      }),
    ).toMatchObject({ status: "DELIVERY_CREATED", revisionNo: 2 });
    expect(
      await getCurrentDeliveryNoteForOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: prepared.orderId,
      }),
    ).toMatchObject({ id: rebuilt.deliveryNote.id });
    expect(
      await db.auditLog.count({
        where: {
          OR: [
            {
              entityId: rebuilt.deliveryNote.id,
              operation: "delivery_note.rebuilt",
            },
            {
              entityId: prepared.orderId,
              operation: "sales_order.delivery_rebuilt",
            },
          ],
        },
      }),
    ).toBe(2);
  });

  it("extends the replacement chain forward without rewriting history", async () => {
    const prepared = await prepareConfirmedRevision();
    const second = await rebuildDeliveryNoteForOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: prepared.orderId,
      expectedRevisionNo: 2,
      reason: "建立第二版",
      idempotencyKey: randomUUID(),
    });
    await startSalesOrderRevision(db, {
      context: contextA,
      companyId: companyA.id,
      orderId: prepared.orderId,
      idempotencyKey: randomUUID(),
    });
    await confirmSalesOrder(db, {
      context: contextA,
      companyId: companyA.id,
      orderId: prepared.orderId,
      idempotencyKey: randomUUID(),
    });
    const third = await rebuildDeliveryNoteForOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: prepared.orderId,
      expectedRevisionNo: 3,
      reason: "建立第三版",
      idempotencyKey: randomUUID(),
    });
    expect(third.deliveryNote.replacedDeliveryNote).toMatchObject({
      id: second.deliveryNote.id,
      salesOrderRevisionNo: 2,
      status: "VOIDED",
    });
    const first = await getDeliveryNote(db, {
      context: contextA,
      companyId: companyA.id,
      deliveryNoteId: prepared.old.id,
    });
    const secondAfter = await getDeliveryNote(db, {
      context: contextA,
      companyId: companyA.id,
      deliveryNoteId: second.deliveryNote.id,
    });
    expect(first.replacementDeliveryNote).toMatchObject({
      id: second.deliveryNote.id,
    });
    expect(secondAfter.replacementDeliveryNote).toMatchObject({
      id: third.deliveryNote.id,
    });
  });

  it("rejects invalid rebuild states, company access and concurrent duplicates", async () => {
    const draft = await createConfirmedOrder(companyA, {
      status: "DRAFT",
      revisionNo: 2,
    });
    await expect(
      rebuildDeliveryNoteForOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: draft.id,
        expectedRevisionNo: 2,
        reason: "不可重建",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteRebuildNotAllowedError);

    const prepared = await prepareConfirmedRevision();
    await expect(
      rebuildDeliveryNoteForOrder(db, {
        context: noPermissionContext,
        companyId: companyA.id,
        salesOrderId: prepared.orderId,
        expectedRevisionNo: 2,
        reason: "無權限",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);

    const results = await Promise.allSettled(
      [randomUUID(), randomUUID()].map((idempotencyKey) =>
        rebuildDeliveryNoteForOrder(db, {
          context: contextA,
          companyId: companyA.id,
          salesOrderId: prepared.orderId,
          expectedRevisionNo: 2,
          reason: "並行重建",
          idempotencyKey,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );

    const downstream = await prepareConfirmedRevision();
    await db.deliveryNote.update({
      where: { id: downstream.old.id },
      data: { status: "SHIPPED" },
    });
    await expect(
      rebuildDeliveryNoteForOrder(db, {
        context: contextA,
        companyId: companyA.id,
        salesOrderId: downstream.orderId,
        expectedRevisionNo: 2,
        reason: "已出貨不可重建",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteDownstreamLockedError);
  });

  it("ADMIN direct void is scoped, idempotent and permits a later new number", async () => {
    const order = await createConfirmedOrder(companyA);
    const created = await createDeliveryNoteFromOrder(db, {
      context: adminContext,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: randomUUID(),
    });
    const key = randomUUID();
    const voided = await adminVoidDeliveryNote(db, {
      context: adminContext,
      companyId: companyA.id,
      deliveryNoteId: created.deliveryNote.id,
      voidReason: "  管理員例外作廢  ",
      idempotencyKey: key,
      now: new Date("2026-07-27T06:00:00.000Z"),
    });
    const replay = await adminVoidDeliveryNote(db, {
      context: adminContext,
      companyId: companyA.id,
      deliveryNoteId: created.deliveryNote.id,
      voidReason: "管理員例外作廢",
      idempotencyKey: key,
    });
    expect(replay).toEqual({ ...voided, replayed: true });
    expect(voided.deliveryNote).toMatchObject({
      status: "VOIDED",
      voidSource: "ADMIN_DIRECT",
      voidReason: "管理員例外作廢",
      voidedById: userId,
    });
    expect(voided.deliveryNote.voidedBy).toMatchObject({ id: userId });
    expect(
      await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: "CONFIRMED" });
    expect(
      await getCurrentDeliveryNoteForOrder(db, {
        context: adminContext,
        companyId: companyA.id,
        salesOrderId: order.id,
      }),
    ).toBeNull();
    expect(
      await db.auditLog.count({
        where: {
          entityId: created.deliveryNote.id,
          operation: "delivery_note.voided",
          reason: "管理員例外作廢",
        },
      }),
    ).toBe(1);
    const replacement = await createDeliveryNoteFromOrder(db, {
      context: adminContext,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: randomUUID(),
    });
    expect(replacement.deliveryNote.deliveryNoteNumber).not.toBe(
      created.deliveryNote.deliveryNoteNumber,
    );
  });

  it("rejects unauthorized, blank, conflicting and downstream ADMIN voids", async () => {
    const order = await createConfirmedOrder(companyA);
    const created = await createDeliveryNoteFromOrder(db, {
      context: contextA,
      companyId: companyA.id,
      salesOrderId: order.id,
      expectedRevisionNo: 1,
      idempotencyKey: randomUUID(),
    });
    await expect(
      adminVoidDeliveryNote(db, {
        context: contextA,
        companyId: companyA.id,
        deliveryNoteId: created.deliveryNote.id,
        voidReason: "ORDER_ENTRY 不可作廢",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);
    await expect(
      adminVoidDeliveryNote(db, {
        context: noScopeAdminContext,
        companyId: companyA.id,
        deliveryNoteId: created.deliveryNote.id,
        voidReason: "跨公司不可作廢",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);
    await expect(
      adminVoidDeliveryNote(db, {
        context: adminContext,
        companyId: companyA.id,
        deliveryNoteId: created.deliveryNote.id,
        voidReason: "   ",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteVoidReasonRequiredError);

    const key = randomUUID();
    await adminVoidDeliveryNote(db, {
      context: adminContext,
      companyId: companyA.id,
      deliveryNoteId: created.deliveryNote.id,
      voidReason: "第一次理由",
      idempotencyKey: key,
    });
    await expect(
      adminVoidDeliveryNote(db, {
        context: adminContext,
        companyId: companyA.id,
        deliveryNoteId: created.deliveryNote.id,
        voidReason: "不同理由",
        idempotencyKey: key,
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteIdempotencyConflictError);
    await expect(
      adminVoidDeliveryNote(db, {
        context: adminContext,
        companyId: companyA.id,
        deliveryNoteId: created.deliveryNote.id,
        voidReason: "重複作廢",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAdminVoidNotAllowedError);

    const shippedOrder = await createConfirmedOrder(companyA);
    const shipped = await createDeliveryNoteFromOrder(db, {
      context: adminContext,
      companyId: companyA.id,
      salesOrderId: shippedOrder.id,
      expectedRevisionNo: 1,
      idempotencyKey: randomUUID(),
    });
    await db.deliveryNote.update({
      where: { id: shipped.deliveryNote.id },
      data: { status: "SHIPPED" },
    });
    await expect(
      adminVoidDeliveryNote(db, {
        context: adminContext,
        companyId: companyA.id,
        deliveryNoteId: shipped.deliveryNote.id,
        voidReason: "下游鎖定",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteDownstreamLockedError);
  });

  it("rolls back every rebuild stage injected by test-only triggers", async () => {
    const stages = [
      {
        name: "header",
        table: "delivery_notes",
        timing: "BEFORE INSERT",
        when: `WHEN (NEW."replaced_delivery_note_id" IS NOT NULL)`,
      },
      {
        name: "line",
        table: "delivery_note_lines",
        timing: "BEFORE INSERT",
        when: "",
      },
      {
        name: "order",
        table: "sales_orders",
        timing: "BEFORE UPDATE",
        when: `WHEN (NEW."status" = 'DELIVERY_CREATED' AND OLD."status" = 'CONFIRMED')`,
      },
      {
        name: "audit",
        table: "audit_logs",
        timing: "BEFORE INSERT",
        when: `WHEN (NEW."operation" IN ('delivery_note.rebuilt', 'sales_order.delivery_rebuilt'))`,
      },
    ] as const;

    for (const stage of stages) {
      const prepared = await prepareConfirmedRevision();
      const auditCountBefore = await db.auditLog.count({
        where: {
          operation: {
            in: ["delivery_note.rebuilt", "sales_order.delivery_rebuilt"],
          },
        },
      });
      const sequenceBefore = await db.documentSequence.findUnique({
        where: {
          companyId_fiscalYear_fiscalMonth_documentType: {
            companyId: companyA.id,
            fiscalYear: 2026,
            fiscalMonth: 7,
            documentType: "DELIVERY_NOTE",
          },
        },
      });
      const functionName = `test_p32c_rebuild_${stage.name}`;
      await db.$executeRawUnsafe(`
        CREATE FUNCTION "${functionName}"()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'P3.2c rebuild ${stage.name} rollback'
            USING ERRCODE = '23514';
        END;
        $$;
        CREATE TRIGGER "${functionName}"
        ${stage.timing} ON "${stage.table}"
        FOR EACH ROW ${stage.when}
        EXECUTE FUNCTION "${functionName}"();
      `);
      const key = randomUUID();
      try {
        await expect(
          rebuildDeliveryNoteForOrder(db, {
            context: contextA,
            companyId: companyA.id,
            salesOrderId: prepared.orderId,
            expectedRevisionNo: 2,
            reason: `測試 ${stage.name} rollback`,
            idempotencyKey: key,
          }),
        ).rejects.toThrow(`P3.2c rebuild ${stage.name} rollback`);
      } finally {
        await db.$executeRawUnsafe(`
          DROP TRIGGER IF EXISTS "${functionName}" ON "${stage.table}";
          DROP FUNCTION IF EXISTS "${functionName}"();
        `);
      }
      expect(
        await db.deliveryNote.findUniqueOrThrow({
          where: { id: prepared.old.id },
        }),
      ).toMatchObject({
        status: "ACTIVE",
        voidSource: null,
        voidedAt: null,
        voidedById: null,
        voidReason: null,
      });
      expect(
        await db.deliveryNote.count({
          where: { salesOrderId: prepared.orderId },
        }),
      ).toBe(1);
      expect(
        await db.salesOrder.findUniqueOrThrow({
          where: { id: prepared.orderId },
        }),
      ).toMatchObject({ status: "CONFIRMED", revisionNo: 2 });
      expect(
        await db.auditLog.count({
          where: {
            operation: {
              in: ["delivery_note.rebuilt", "sales_order.delivery_rebuilt"],
            },
          },
        }),
      ).toBe(auditCountBefore);
      expect(
        await db.idempotencyKey.findUniqueOrThrow({
          where: {
            companyId_operation_idempotencyKey: {
              companyId: companyA.id,
              operation: "delivery_note.rebuild",
              idempotencyKey: key,
            },
          },
        }),
      ).toMatchObject({ status: "FAILED" });
      const sequenceAfter = await db.documentSequence.findUnique({
        where: {
          companyId_fiscalYear_fiscalMonth_documentType: {
            companyId: companyA.id,
            fiscalYear: 2026,
            fiscalMonth: 7,
            documentType: "DELIVERY_NOTE",
          },
        },
      });
      expect(sequenceAfter?.lastValue ?? BigInt(0)).toBe(
        sequenceBefore?.lastValue ?? BigInt(0),
      );
    }
  });

  it("rolls back ADMIN void note, order and audit failures", async () => {
    const stages = [
      {
        name: "note",
        table: "delivery_notes",
        timing: "BEFORE UPDATE",
        when: `WHEN (NEW."void_source" = 'ADMIN_DIRECT')`,
      },
      {
        name: "order",
        table: "sales_orders",
        timing: "BEFORE UPDATE",
        when: `WHEN (NEW."status" = 'CONFIRMED' AND OLD."status" = 'DELIVERY_CREATED')`,
      },
      {
        name: "audit",
        table: "audit_logs",
        timing: "BEFORE INSERT",
        when: `WHEN (NEW."operation" = 'delivery_note.voided')`,
      },
    ] as const;

    for (const stage of stages) {
      const order = await createConfirmedOrder(companyA);
      const created = await createDeliveryNoteFromOrder(db, {
        context: adminContext,
        companyId: companyA.id,
        salesOrderId: order.id,
        expectedRevisionNo: 1,
        idempotencyKey: randomUUID(),
      });
      const functionName = `test_p32c_admin_void_${stage.name}`;
      await db.$executeRawUnsafe(`
        CREATE FUNCTION "${functionName}"()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'P3.2c admin void ${stage.name} rollback'
            USING ERRCODE = '23514';
        END;
        $$;
        CREATE TRIGGER "${functionName}"
        ${stage.timing} ON "${stage.table}"
        FOR EACH ROW ${stage.when}
        EXECUTE FUNCTION "${functionName}"();
      `);
      const key = randomUUID();
      try {
        await expect(
          adminVoidDeliveryNote(db, {
            context: adminContext,
            companyId: companyA.id,
            deliveryNoteId: created.deliveryNote.id,
            voidReason: `測試 ${stage.name} rollback`,
            idempotencyKey: key,
          }),
        ).rejects.toThrow(`P3.2c admin void ${stage.name} rollback`);
      } finally {
        await db.$executeRawUnsafe(`
          DROP TRIGGER IF EXISTS "${functionName}" ON "${stage.table}";
          DROP FUNCTION IF EXISTS "${functionName}"();
        `);
      }
      expect(
        await db.deliveryNote.findUniqueOrThrow({
          where: { id: created.deliveryNote.id },
        }),
      ).toMatchObject({
        status: "ACTIVE",
        voidSource: null,
        voidedAt: null,
        voidReason: null,
      });
      expect(
        await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
      ).toMatchObject({ status: "DELIVERY_CREATED" });
      expect(
        await db.auditLog.count({
          where: {
            entityId: created.deliveryNote.id,
            operation: "delivery_note.voided",
          },
        }),
      ).toBe(0);
      expect(
        await db.idempotencyKey.findUniqueOrThrow({
          where: {
            companyId_operation_idempotencyKey: {
              companyId: companyA.id,
              operation: "delivery_note.admin_void",
              idempotencyKey: key,
            },
          },
        }),
      ).toMatchObject({ status: "FAILED" });
    }
  });

  it("exposes create, replay, current, detail and list through the real API boundary", async () => {
    const order = await createConfirmedOrder(companyA);
    const idempotencyKey = randomUUID();
    const requestId = `api-create-${randomUUID()}`;
    const create = await createDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note`,
        adminSessionToken,
        {
          method: "POST",
          body: { expectedRevisionNo: 1 },
          idempotencyKey,
          requestId,
        },
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(create.status).toBe(201);
    expect(create.headers.get("x-request-id")).toBe(requestId);
    const createBody = (await create.json()) as {
      deliveryNote: {
        id: string;
        deliveryNoteNumber: string;
        subtotal: string;
        freightAmount: string;
        totalAmount: string;
        deliveryNoteDate: string;
        lines: Array<{
          quantity: string;
          unitPrice: string;
          lineAmount: string;
        }>;
      };
      replayed: boolean;
      correlationId: string;
    };
    expect(createBody).toMatchObject({
      replayed: false,
      correlationId: requestId,
      deliveryNote: {
        subtotal: "10",
        freightAmount: "2",
        totalAmount: "12",
      },
    });
    expect(createBody.deliveryNote.deliveryNoteNumber).toMatch(
      new RegExp(`^DN-${documentCodeA}-202607-\\d{6}$`),
    );
    expect(createBody.deliveryNote.deliveryNoteDate).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(createBody.deliveryNote.lines[0]).toMatchObject({
      quantity: "1.0000",
      unitPrice: "10.00000",
      lineAmount: "10",
    });

    const replay = await createDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note`,
        adminSessionToken,
        {
          method: "POST",
          body: { expectedRevisionNo: 1 },
          idempotencyKey,
        },
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      deliveryNote: { id: createBody.deliveryNote.id },
    });

    const current = await getCurrentDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note`,
        adminSessionToken,
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(current.status).toBe(200);
    await expect(current.json()).resolves.toMatchObject({
      deliveryNote: { id: createBody.deliveryNote.id },
    });

    const detail = await getDeliveryNoteRoute(
      apiRequest(
        `/api/delivery-notes/${createBody.deliveryNote.id}`,
        adminSessionToken,
      ),
      { params: Promise.resolve({ id: createBody.deliveryNote.id }) },
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      deliveryNote: {
        id: createBody.deliveryNote.id,
        customer: { name: "確認時客戶" },
      },
    });

    const list = await listDeliveryNotesRoute(
      apiRequest(
        `/api/delivery-notes?salesOrderId=${order.id}&status=ACTIVE&page=1&pageSize=10`,
        adminSessionToken,
      ),
    );
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      items: [
        {
          id: createBody.deliveryNote.id,
          customer: { name: "確認時客戶" },
          voidSource: null,
          voidedAt: null,
          voidReason: null,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });
  });

  it("enforces API auth, strict input, company scope and concurrent uniqueness", async () => {
    const order = await createConfirmedOrder(companyA);
    const unauthenticated = await createDeliveryNoteRoute(
      apiRequest(`/api/sales-orders/${order.id}/delivery-note`, undefined, {
        method: "POST",
        body: { expectedRevisionNo: 1 },
        idempotencyKey: randomUUID(),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(unauthenticated.status).toBe(401);

    const injected = await createDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note`,
        adminSessionToken,
        {
          method: "POST",
          body: {
            expectedRevisionNo: 1,
            companyId: companyB.id,
            status: "VOIDED",
          },
          idempotencyKey: randomUUID(),
        },
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(injected.status).toBe(400);

    const missingKey = await createDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note`,
        adminSessionToken,
        {
          method: "POST",
          body: { expectedRevisionNo: 1 },
        },
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(missingKey.status).toBe(400);

    const concurrent = await Promise.all(
      [randomUUID(), randomUUID()].map((idempotencyKey) =>
        createDeliveryNoteRoute(
          apiRequest(
            `/api/sales-orders/${order.id}/delivery-note`,
            adminSessionToken,
            {
              method: "POST",
              body: { expectedRevisionNo: 1 },
              idempotencyKey,
            },
          ),
          { params: Promise.resolve({ id: order.id }) },
        ),
      ),
    );
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      201,
      409,
    ]);
    expect(
      await db.deliveryNote.count({
        where: {
          salesOrderId: order.id,
          status: { not: "VOIDED" },
        },
      }),
    ).toBe(1);

    const companyBOrder = await createConfirmedOrder(companyB);
    const crossCompany = await getCurrentDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${companyBOrder.id}/delivery-note`,
        orderEntrySessionToken,
      ),
      { params: Promise.resolve({ id: companyBOrder.id }) },
    );
    expect(crossCompany.status).toBe(404);
  });

  it("rebuilds and ADMIN-voids through the API with stable replay and role enforcement", async () => {
    const order = await createConfirmedOrder(companyA);
    const initial = await createDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note`,
        adminSessionToken,
        {
          method: "POST",
          body: { expectedRevisionNo: 1 },
          idempotencyKey: randomUUID(),
        },
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    const initialBody = (await initial.json()) as {
      deliveryNote: { id: string };
    };
    await startSalesOrderRevision(db, {
      context: adminContext,
      companyId: companyA.id,
      orderId: order.id,
      idempotencyKey: randomUUID(),
    });
    await confirmSalesOrder(db, {
      context: adminContext,
      companyId: companyA.id,
      orderId: order.id,
      idempotencyKey: randomUUID(),
    });

    const rebuildKey = randomUUID();
    const rebuild = await rebuildDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note/rebuild`,
        adminSessionToken,
        {
          method: "POST",
          body: {
            expectedRevisionNo: 2,
            reason: "API 修訂後重建",
          },
          idempotencyKey: rebuildKey,
        },
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(rebuild.status).toBe(200);
    const rebuildBody = (await rebuild.json()) as {
      deliveryNote: {
        id: string;
        replacedDeliveryNoteId: string | null;
      };
      replayed: boolean;
    };
    expect(rebuildBody).toMatchObject({
      replayed: false,
      deliveryNote: {
        replacedDeliveryNoteId: initialBody.deliveryNote.id,
      },
    });
    const rebuildReplay = await rebuildDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note/rebuild`,
        adminSessionToken,
        {
          method: "POST",
          body: {
            expectedRevisionNo: 2,
            reason: "API 修訂後重建",
          },
          idempotencyKey: rebuildKey,
        },
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(rebuildReplay.status).toBe(200);
    await expect(rebuildReplay.json()).resolves.toMatchObject({
      replayed: true,
      deliveryNote: { id: rebuildBody.deliveryNote.id },
    });

    const forbiddenVoid = await adminVoidDeliveryNoteRoute(
      apiRequest(
        `/api/delivery-notes/${rebuildBody.deliveryNote.id}/void`,
        orderEntrySessionToken,
        {
          method: "POST",
          body: { reason: "ORDER_ENTRY 不可作廢" },
          idempotencyKey: randomUUID(),
        },
      ),
      { params: Promise.resolve({ id: rebuildBody.deliveryNote.id }) },
    );
    expect(forbiddenVoid.status).toBe(403);

    const voidKey = randomUUID();
    const voided = await adminVoidDeliveryNoteRoute(
      apiRequest(
        `/api/delivery-notes/${rebuildBody.deliveryNote.id}/void`,
        adminSessionToken,
        {
          method: "POST",
          body: { reason: "API 管理員直接作廢" },
          idempotencyKey: voidKey,
        },
      ),
      { params: Promise.resolve({ id: rebuildBody.deliveryNote.id }) },
    );
    expect(voided.status).toBe(200);
    await expect(voided.json()).resolves.toMatchObject({
      replayed: false,
      deliveryNote: {
        id: rebuildBody.deliveryNote.id,
        status: "VOIDED",
        voidSource: "ADMIN_DIRECT",
        voidReason: "API 管理員直接作廢",
      },
    });
    const voidReplay = await adminVoidDeliveryNoteRoute(
      apiRequest(
        `/api/delivery-notes/${rebuildBody.deliveryNote.id}/void`,
        adminSessionToken,
        {
          method: "POST",
          body: { reason: "API 管理員直接作廢" },
          idempotencyKey: voidKey,
        },
      ),
      { params: Promise.resolve({ id: rebuildBody.deliveryNote.id }) },
    );
    expect(voidReplay.status).toBe(200);
    await expect(voidReplay.json()).resolves.toMatchObject({
      replayed: true,
      deliveryNote: { id: rebuildBody.deliveryNote.id },
    });

    const current = await getCurrentDeliveryNoteRoute(
      apiRequest(
        `/api/sales-orders/${order.id}/delivery-note`,
        adminSessionToken,
      ),
      { params: Promise.resolve({ id: order.id }) },
    );
    await expect(current.json()).resolves.toMatchObject({
      deliveryNote: null,
    });
  });
});
