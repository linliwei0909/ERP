import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";
import {
  confirmSalesOrder,
  createSalesOrderDraft,
  SalesOrderPrerequisiteError,
  startSalesOrderRevision,
  updateSalesOrderDraft,
  voidSalesOrder,
} from "../../src/lib/sales-orders/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P3.1 sales-order workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyA: { id: string; code: string; name: string };
  let companyB: { id: string; code: string; name: string };
  let orderContext: RequestContext;
  let customerId: string;
  let locationId: string;
  let contactId: string;
  let itemId: string;

  beforeAll(async () => {
    [companyA, companyB] = await Promise.all([
      db.company.create({
        data: { code: `SOA-${suffix}`, name: "訂單測試公司 A" },
      }),
      db.company.create({
        data: { code: `SOB-${suffix}`, name: "訂單測試公司 B" },
      }),
    ]);
    const role = await db.role.upsert({
      where: { code: "ORDER_ENTRY" },
      update: {},
      create: { code: "ORDER_ENTRY", name: "訂單輸入人員" },
    });
    const user = await db.user.create({
      data: {
        username: `sales-order-${suffix}`,
        normalizedUsername: `sales-order-${suffix}`,
        passwordHash: "test",
        defaultCompanyId: companyA.id,
      },
    });
    await Promise.all([
      db.userRole.create({ data: { userId: user.id, roleId: role.id } }),
      db.userCompanyScope.create({
        data: { userId: user.id, companyId: companyA.id },
      }),
    ]);
    const session = await db.userSession.create({
      data: {
        userId: user.id,
        tokenHash: `sales-order-${randomUUID()}`,
        selectedCompanyId: companyA.id,
      },
    });
    orderContext = {
      actor: { userId: user.id, username: user.username },
      session: { sessionId: session.id },
      requestId: `sales-order-${suffix}`,
      roleCodes: ["ORDER_ENTRY"],
      authorizedCompanies: [companyA],
      selectedCompany: companyA,
    };

    const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");
    await db.companySetting.createMany({
      data: [
        {
          companyId: companyA.id,
          settingKey: "company_name",
          settingValue: "奇麗測試實業有限公司",
          effectiveFrom,
        },
        {
          companyId: companyA.id,
          settingKey: "document_company_code",
          settingValue: "TA",
          effectiveFrom,
        },
        {
          companyId: companyA.id,
          settingKey: "company_tax_id",
          settingValue: "12345678",
          effectiveFrom,
        },
        {
          companyId: companyA.id,
          settingKey: "company_address",
          settingValue: "測試地址",
          effectiveFrom,
        },
        {
          companyId: companyA.id,
          settingKey: "company_phone",
          settingValue: "02-12345678",
          effectiveFrom,
        },
      ],
    });

    const customer = await db.customer.create({
      data: {
        customerType: "DOMESTIC",
        name: `訂單客戶 ${suffix}`,
        taxId: "87654321",
        normalizedTaxId: `SO-${suffix}`,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    customerId = customer.id;
    await db.customerCompany.create({
      data: {
        customerId,
        companyId: companyA.id,
        customerCode: `C-${suffix}`,
        normalizedCustomerCode: `C-${suffix}`.toUpperCase(),
        createdById: user.id,
        updatedById: user.id,
      },
    });
    const contact = await db.customerContact.create({
      data: {
        customerId,
        name: "主要聯絡人",
        phone: "02-00000000",
        isPrimary: true,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    contactId = contact.id;
    const location = await db.deliveryLocation.create({
      data: {
        customerId,
        code: "MAIN",
        name: "主要送貨點",
        recipientName: "收貨人",
        phone: "02-00000000",
        addressLine: "測試路一號",
        fullAddress: "新北市測試路一號",
        createdById: user.id,
        updatedById: user.id,
      },
    });
    locationId = location.id;
    const item = await db.item.create({
      data: {
        code: `ITEM-${suffix}`,
        normalizedCode: `ITEM-${suffix}`,
        name: "測試品項",
        baseUnit: "PCS",
        itemType: "PRODUCT",
        salesEnabled: true,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    itemId = item.id;
    await db.itemCompany.create({
      data: {
        itemId,
        companyId: companyA.id,
        companyItemCode: `A-${suffix}`,
        normalizedCompanyItemCode: `A-${suffix}`,
        salesEnabled: true,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    const priceList = await db.priceList.create({
      data: {
        companyId: companyA.id,
        code: `PL-${suffix}`,
        normalizedCode: `PL-${suffix}`,
        name: "正式價格表",
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await db.customerPriceListAssignment.create({
      data: {
        customerId,
        companyId: companyA.id,
        priceListId: priceList.id,
        validFrom: effectiveFrom,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await db.itemPrice.create({
      data: {
        priceListId: priceList.id,
        itemId,
        unitPrice: "10.50000",
        validFrom: effectiveFrom,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await db.freightRule.create({
      data: {
        customerId,
        companyId: companyA.id,
        deliveryLocationId: locationId,
        mode: "QUANTITY_BASED",
        unitFreight: "3",
        validFrom: effectiveFrom,
        createdById: user.id,
        updatedById: user.id,
      },
    });
  });

  afterAll(async () => db.$disconnect());

  function draft(
    overrides: Partial<{
      unitPrice: string;
      manualPriceReason: string;
      quantity: string;
    }> = {},
  ) {
    return {
      orderDate: "2026-07-27",
      customerId,
      deliveryLocationId: locationId,
      paymentTermsText: "月結 30 天",
      lines: [
        {
          itemId,
          quantity: overrides.quantity ?? "1.2345",
          ...(overrides.unitPrice
            ? { unitPrice: overrides.unitPrice }
            : {}),
          ...(overrides.manualPriceReason
            ? { manualPriceReason: overrides.manualPriceReason }
            : {}),
        },
      ],
    };
  }

  it("creates a numbered draft idempotently with scoped snapshots", async () => {
    const key = randomUUID();
    const first = await createSalesOrderDraft(db, {
      context: orderContext,
      companyId: companyA.id,
      draft: draft(),
      idempotencyKey: key,
    });
    expect(
      await createSalesOrderDraft(db, {
        context: orderContext,
        companyId: companyA.id,
        draft: draft(),
        idempotencyKey: key,
      }),
    ).toEqual({ id: first.id, replayed: true });
    const order = await db.salesOrder.findUniqueOrThrow({
      where: { id: first.id },
      include: { lines: true },
    });
    expect(order.orderNumber).toMatch(/^SO-TA-202607-\d{6}$/);
    expect(order.status).toBe("DRAFT");
    expect(order.revisionNo).toBe(1);
    expect(order.customerContactId).toBe(contactId);
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]?.priceSource).toBe("STANDARD");
    expect(order.lines[0]?.lineAmount.toFixed(0)).toBe("13");
    expect(order.freightAmount.toFixed(0)).toBe("4");
    expect(
      await db.auditLog.count({
        where: { entityId: first.id, operation: "sales_order.created" },
      }),
    ).toBe(1);
  });

  it("confirms and freezes standard price, freight, company and master snapshots", async () => {
    const created = await createSalesOrderDraft(db, {
      context: orderContext,
      companyId: companyA.id,
      draft: draft(),
      idempotencyKey: randomUUID(),
    });
    await confirmSalesOrder(db, {
      context: orderContext,
      companyId: companyA.id,
      orderId: created.id,
      idempotencyKey: randomUUID(),
    });
    const before = await db.salesOrder.findUniqueOrThrow({
      where: { id: created.id },
      include: { lines: { where: { isActive: true } } },
    });
    expect(before.status).toBe("CONFIRMED");
    expect(before.subtotal.toFixed(0)).toBe("13");
    expect(before.freightAmount.toFixed(0)).toBe("4");
    expect(before.totalAmount.toFixed(0)).toBe("17");
    expect(before.companySnapshot).toMatchObject({
      documentCompanyCode: "TA",
      companyTaxId: "12345678",
    });
    await db.customer.update({
      where: { id: customerId },
      data: { name: "已修改客戶名稱" },
    });
    await db.item.update({
      where: { id: itemId },
      data: { name: "已修改品項名稱" },
    });
    const after = await db.salesOrder.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.customerSnapshot).toEqual(before.customerSnapshot);
    expect(
      (before.lines[0]?.itemSnapshot as { name: string }).name,
    ).toBe("測試品項");
  });

  it("requires reasons for standard override and manual prices", async () => {
    await expect(
      createSalesOrderDraft(db, {
        context: orderContext,
        companyId: companyA.id,
        draft: draft({ unitPrice: "11" }),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(SalesOrderPrerequisiteError);
    const override = await createSalesOrderDraft(db, {
      context: orderContext,
      companyId: companyA.id,
      draft: draft({
        unitPrice: "11",
        manualPriceReason: "客戶議價",
      }),
      idempotencyKey: randomUUID(),
    });
    await confirmSalesOrder(db, {
      context: orderContext,
      companyId: companyA.id,
      orderId: override.id,
      idempotencyKey: randomUUID(),
    });
    const line = await db.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: override.id, isActive: true },
    });
    expect(line.priceSource).toBe("STANDARD_OVERRIDE");
    expect(line.manualPriceReason).toBe("客戶議價");
    expect(
      await db.auditLog.count({
        where: {
          entityId: line.id,
          operation: "sales_order.standard_price_overridden",
        },
      }),
    ).toBe(1);
  });

  it("records a missing formal price as MANUAL without updating the price master", async () => {
    const manualItem = await db.item.create({
      data: {
        code: `MANUAL-${suffix}`,
        normalizedCode: `MANUAL-${suffix}`,
        name: "無正式價格品項",
        baseUnit: "PCS",
        itemType: "PRODUCT",
        salesEnabled: true,
        createdById: orderContext.actor.userId,
        updatedById: orderContext.actor.userId,
      },
    });
    await db.itemCompany.create({
      data: {
        itemId: manualItem.id,
        companyId: companyA.id,
        companyItemCode: `M-${suffix}`,
        normalizedCompanyItemCode: `M-${suffix}`,
        salesEnabled: true,
        createdById: orderContext.actor.userId,
        updatedById: orderContext.actor.userId,
      },
    });

    const created = await createSalesOrderDraft(db, {
      context: orderContext,
      companyId: companyA.id,
      draft: {
        ...draft(),
        lines: [
          {
            itemId: manualItem.id,
            quantity: "2",
            unitPrice: "12.34567",
            manualPriceReason: "尚無正式價格",
          },
        ],
      },
      idempotencyKey: randomUUID(),
    });
    await confirmSalesOrder(db, {
      context: orderContext,
      companyId: companyA.id,
      orderId: created.id,
      idempotencyKey: randomUUID(),
    });

    const line = await db.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: created.id, isActive: true },
    });
    expect(line.priceSource).toBe("MANUAL");
    expect(line.itemPriceId).toBeNull();
    expect(line.priceListId).toBeNull();
    expect(line.lineAmount.toFixed(0)).toBe("25");
    expect(
      await db.itemPrice.count({ where: { itemId: manualItem.id } }),
    ).toBe(0);
  });

  it("uses formal revision and void workflows without hard deleting lines", async () => {
    const created = await createSalesOrderDraft(db, {
      context: orderContext,
      companyId: companyA.id,
      draft: draft(),
      idempotencyKey: randomUUID(),
    });
    await confirmSalesOrder(db, {
      context: orderContext,
      companyId: companyA.id,
      orderId: created.id,
      idempotencyKey: randomUUID(),
    });
    await startSalesOrderRevision(db, {
      context: orderContext,
      companyId: companyA.id,
      orderId: created.id,
      idempotencyKey: randomUUID(),
    });
    const revised = await db.salesOrder.findUniqueOrThrow({
      where: { id: created.id },
      include: { lines: { where: { isActive: true } } },
    });
    expect(revised.status).toBe("DRAFT");
    expect(revised.revisionNo).toBe(2);
    expect(revised.confirmedAt).toBeNull();
    await updateSalesOrderDraft(db, {
      context: orderContext,
      companyId: companyA.id,
      orderId: created.id,
      draft: {
        ...draft(),
        lines: [],
      },
      idempotencyKey: randomUUID(),
    });
    expect(
      await db.salesOrderLine.count({
        where: { salesOrderId: created.id, isActive: false },
      }),
    ).toBe(1);
    await voidSalesOrder(db, {
      context: orderContext,
      companyId: companyA.id,
      orderId: created.id,
      reason: "客戶取消",
      idempotencyKey: randomUUID(),
    });
    await expect(
      startSalesOrderRevision(db, {
        context: orderContext,
        companyId: companyA.id,
        orderId: created.id,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it("keeps monthly numbering concurrent and never trusts forged company scope", async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, () =>
        createSalesOrderDraft(db, {
          context: orderContext,
          companyId: companyA.id,
          draft: draft(),
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    const orders = await db.salesOrder.findMany({
      where: { id: { in: created.map((entry) => entry.id) } },
    });
    expect(new Set(orders.map((order) => order.orderNumber)).size).toBe(5);
    await expect(
      createSalesOrderDraft(db, {
        context: orderContext,
        companyId: companyB.id,
        draft: draft(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(CompanyAccessError);
  });

  it("enforces catalog constraints and does not create prohibited tables", async () => {
    const constraints = await db.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name
        FROM pg_constraint
       WHERE conname IN (
         'sales_orders_amount_check',
         'sales_orders_confirmation_check',
         'sales_orders_void_check',
         'sales_order_lines_quantity_check',
         'sales_order_lines_price_source_check',
         'sales_order_lines_removal_check',
         'sales_order_relations_not_self_check',
         'sales_orders_customer_id_company_id_fkey',
         'sales_order_lines_item_id_company_id_fkey'
       )
    `;
    expect(constraints).toHaveLength(9);
    const prohibited = await db.$queryRaw<Array<{ table_name: string }>>`
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
    expect(prohibited).toEqual([]);
  });
});
