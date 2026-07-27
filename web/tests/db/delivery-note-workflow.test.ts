import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import {
  createDeliveryNoteFromOrder,
  getCurrentDeliveryNoteForOrder,
  getDeliveryNote,
  listDeliveryNotes,
} from "../../src/lib/delivery-notes/service";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteAlreadyExistsError,
  DeliveryNoteIdempotencyConflictError,
  DeliveryNoteInvariantError,
  DeliveryNotePrerequisiteError,
} from "../../src/lib/delivery-notes/errors";
import { voidSalesOrder } from "../../src/lib/sales-orders/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P3.2b delivery-note workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyA: { id: string; code: string; name: string };
  let companyB: { id: string; code: string; name: string };
  let contextA: RequestContext;
  let contextBoth: RequestContext;
  let noPermissionContext: RequestContext;
  let customerId: string;
  let deliveryLocationId: string;
  let itemId: string;
  let userId: string;
  let orderCounter = 0;
  let documentCodeA: string;
  let documentCodeB: string;

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
      db.userCompanyScope.create({
        data: { userId, companyId: companyA.id },
      }),
      db.userCompanyScope.create({
        data: { userId, companyId: companyB.id },
      }),
    ]);
    const session = await db.userSession.create({
      data: {
        userId,
        tokenHash: `delivery-note-${randomUUID()}`,
        selectedCompanyId: companyA.id,
      },
    });
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
});
