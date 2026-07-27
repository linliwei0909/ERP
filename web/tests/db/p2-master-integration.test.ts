import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";
import {
  createFutureSettingVersion,
  resolveBillingCutoffDate,
} from "../../src/lib/company-settings/service";
import {
  assignCustomerCompany,
  createCustomer,
  listCustomers,
  saveDeliveryLocation,
} from "../../src/lib/customers/service";
import {
  assignItemCompany,
  createItem,
  listItems,
} from "../../src/lib/items/service";
import {
  createItemPriceVersion,
  createPriceAssignment,
  createPriceList,
  getEffectivePrice,
  PriceNotFoundError,
} from "../../src/lib/pricing/service";
import {
  createFreightRule,
  FreightRuleNotFoundError,
  quoteFreight,
} from "../../src/lib/freight/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P2 complete master-data integration", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyA: { id: string; code: string; name: string };
  let companyB: { id: string; code: string; name: string };
  let adminContext: RequestContext;
  let orderContext: RequestContext;

  beforeAll(async () => {
    [companyA, companyB] = await Promise.all([
      db.company.create({
        data: { code: `P2A-${suffix}`, name: `P2 整合公司 A ${suffix}` },
      }),
      db.company.create({
        data: { code: `P2B-${suffix}`, name: `P2 整合公司 B ${suffix}` },
      }),
    ]);
    const [adminRole, orderRole] = await Promise.all([
      db.role.upsert({
        where: { code: "ADMIN" },
        update: { status: "ACTIVE" },
        create: { code: "ADMIN", name: "管理員" },
      }),
      db.role.upsert({
        where: { code: "ORDER_ENTRY" },
        update: { status: "ACTIVE" },
        create: { code: "ORDER_ENTRY", name: "訂單輸入人員" },
      }),
    ]);
    const [admin, order] = await Promise.all([
      db.user.create({
        data: {
          username: `p2-admin-${suffix}`,
          normalizedUsername: `p2-admin-${suffix}`,
          passwordHash: "test",
          defaultCompanyId: companyA.id,
        },
      }),
      db.user.create({
        data: {
          username: `p2-order-${suffix}`,
          normalizedUsername: `p2-order-${suffix}`,
          passwordHash: "test",
          defaultCompanyId: companyA.id,
        },
      }),
    ]);
    await Promise.all([
      db.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } }),
      db.userRole.create({ data: { userId: order.id, roleId: orderRole.id } }),
      db.userCompanyScope.create({
        data: { userId: admin.id, companyId: companyA.id },
      }),
      db.userCompanyScope.create({
        data: { userId: admin.id, companyId: companyB.id },
      }),
      db.userCompanyScope.create({
        data: { userId: order.id, companyId: companyA.id },
      }),
    ]);
    const [adminSession, orderSession] = await Promise.all([
      db.userSession.create({
        data: {
          userId: admin.id,
          tokenHash: `p2-admin-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
      db.userSession.create({
        data: {
          userId: order.id,
          tokenHash: `p2-order-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
    ]);
    adminContext = {
      actor: { userId: admin.id, username: admin.username },
      session: { sessionId: adminSession.id },
      requestId: `p2-admin-${suffix}`,
      roleCodes: ["ADMIN"],
      authorizedCompanies: [companyA, companyB],
      selectedCompany: companyA,
    };
    orderContext = {
      actor: { userId: order.id, username: order.username },
      session: { sessionId: orderSession.id },
      requestId: `p2-order-${suffix}`,
      roleCodes: ["ORDER_ENTRY"],
      authorizedCompanies: [companyA],
      selectedCompany: companyA,
    };
  });

  afterAll(async () => db.$disconnect());

  it("builds, queries, scopes and deactivates the complete P2 chain", async () => {
    await createFutureSettingVersion(db, {
      context: adminContext,
      companyId: companyA.id,
      settingKey: "billing_cutoff_day",
      settingValue: 31,
      effectiveFrom: new Date("2030-01-01T00:00:00Z"),
      now: new Date("2029-12-01T00:00:00Z"),
      idempotencyKey: randomUUID(),
    });
    expect(
      await resolveBillingCutoffDate(db, companyA.id, 2030, 2),
    ).toEqual(new Date("2030-02-28T00:00:00.000Z"));

    const customerKey = randomUUID();
    const customer = await createCustomer(db, {
      context: adminContext,
      companyId: companyA.id,
      customer: {
        customerType: "DOMESTIC",
        name: `整合客戶 ${suffix}`,
      },
      customerCode: `C-${suffix}`,
      idempotencyKey: customerKey,
    });
    const customerReplay = await createCustomer(db, {
      context: adminContext,
      companyId: companyA.id,
      customer: {
        customerType: "DOMESTIC",
        name: `整合客戶 ${suffix}`,
      },
      customerCode: `C-${suffix}`,
      idempotencyKey: customerKey,
    });
    expect(customerReplay).toMatchObject({ id: customer.id, replayed: true });

    const location = await saveDeliveryLocation(db, {
      context: adminContext,
      companyId: companyA.id,
      customerId: customer.id,
      location: {
        code: "MAIN",
        name: "主要送貨地點",
        recipientName: "收件人",
        phone: "02-00000000",
        city: "台北市",
        district: "中正區",
        addressLine: "測試路 1 號",
        isDefault: true,
        status: "ACTIVE",
      },
      idempotencyKey: randomUUID(),
    });
    const item = await createItem(db, {
      context: adminContext,
      companyId: companyA.id,
      item: {
        code: `I-${suffix}`,
        name: `整合品項 ${suffix}`,
        baseUnit: "PCS",
        itemType: "PRODUCT",
        salesEnabled: true,
        purchaseEnabled: false,
        inventoryEnabled: false,
        productionEnabled: false,
      },
      companyRelation: {
        companyItemCode: `IC-${suffix}`,
        salesEnabled: true,
        status: "ACTIVE",
      },
      idempotencyKey: randomUUID(),
    });
    const priceList = await createPriceList(db, {
      context: adminContext,
      companyId: companyA.id,
      priceList: { code: `PL-${suffix}`, name: "整合價格表" },
      idempotencyKey: randomUUID(),
    });
    await createItemPriceVersion(db, {
      context: adminContext,
      companyId: companyA.id,
      priceListId: priceList.id,
      price: {
        itemId: item.id,
        unitPrice: "123.45678",
        validFrom: "2030-01-01",
        validTo: "2030-03-01",
      },
      idempotencyKey: randomUUID(),
    });
    await createPriceAssignment(db, {
      context: adminContext,
      companyId: companyA.id,
      assignment: {
        customerId: customer.id,
        priceListId: priceList.id,
        validFrom: "2030-01-01",
        validTo: "2030-03-01",
      },
      idempotencyKey: randomUUID(),
    });
    await createFreightRule(db, {
      context: adminContext,
      companyId: companyA.id,
      freightRule: {
        customerId: customer.id,
        deliveryLocationId: location.id,
        mode: "QUANTITY_BASED",
        unitFreight: "10",
        fixedFreight: null,
        validFrom: "2030-01-01",
        validTo: "2030-03-01",
      },
      idempotencyKey: randomUUID(),
    });

    expect(
      (await listCustomers(db, {
        context: orderContext,
        companyId: companyA.id,
        query: { search: suffix, status: "ACTIVE", page: 1, pageSize: 20 },
      })).items.some((entry) => entry.id === customer.id),
    ).toBe(true);
    expect(
      (await listItems(db, {
        context: orderContext,
        companyId: companyA.id,
        query: {
          search: suffix,
          status: "ACTIVE",
          itemType: "ALL",
          salesOnly: true,
          page: 1,
          pageSize: 20,
        },
      })).items.some((entry) => entry.id === item.id),
    ).toBe(true);
    await expect(
      getEffectivePrice(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        itemId: item.id,
        effectiveDate: "2030-02-28",
      }),
    ).resolves.toMatchObject({ unitPrice: "123.45678" });
    await expect(
      quoteFreight(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        deliveryLocationId: location.id,
        effectiveDate: "2030-02-28",
        quantity: "3",
      }),
    ).resolves.toMatchObject({ freightAmount: "30" });
    await expect(
      getEffectivePrice(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        itemId: item.id,
        effectiveDate: "2030-03-01",
      }),
    ).rejects.toBeInstanceOf(PriceNotFoundError);
    await expect(
      quoteFreight(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        deliveryLocationId: location.id,
        effectiveDate: "2030-03-01",
        quantity: "3",
      }),
    ).rejects.toBeInstanceOf(FreightRuleNotFoundError);
    await expect(
      listCustomers(db, {
        context: orderContext,
        companyId: companyB.id,
        query: {},
      }),
    ).rejects.toBeInstanceOf(CompanyAccessError);

    await assignItemCompany(db, {
      context: adminContext,
      companyId: companyA.id,
      itemId: item.id,
      relation: {
        companyItemCode: `IC-${suffix}`,
        salesEnabled: true,
        status: "INACTIVE",
      },
      idempotencyKey: randomUUID(),
    });
    await expect(
      getEffectivePrice(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        itemId: item.id,
        effectiveDate: "2030-02-28",
      }),
    ).rejects.toBeInstanceOf(PriceNotFoundError);
    await assignItemCompany(db, {
      context: adminContext,
      companyId: companyA.id,
      itemId: item.id,
      relation: {
        companyItemCode: `IC-${suffix}`,
        salesEnabled: true,
        status: "ACTIVE",
      },
      idempotencyKey: randomUUID(),
    });

    await saveDeliveryLocation(db, {
      context: adminContext,
      companyId: companyA.id,
      customerId: customer.id,
      locationId: location.id,
      location: {
        code: "MAIN",
        name: "主要送貨地點",
        recipientName: "收件人",
        phone: "02-00000000",
        city: "台北市",
        district: "中正區",
        addressLine: "測試路 1 號",
        isDefault: false,
        status: "INACTIVE",
      },
      idempotencyKey: randomUUID(),
    });
    await expect(
      quoteFreight(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        deliveryLocationId: location.id,
        effectiveDate: "2030-02-28",
        quantity: "3",
      }),
    ).rejects.toBeInstanceOf(FreightRuleNotFoundError);

    await assignCustomerCompany(db, {
      context: adminContext,
      companyId: companyA.id,
      customerId: customer.id,
      relation: { customerCode: `C-${suffix}`, status: "INACTIVE" },
      idempotencyKey: randomUUID(),
    });
    await expect(
      getEffectivePrice(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        itemId: item.id,
        effectiveDate: "2030-02-28",
      }),
    ).rejects.toBeInstanceOf(PriceNotFoundError);
    await expect(
      quoteFreight(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: customer.id,
        deliveryLocationId: location.id,
        effectiveDate: "2030-02-28",
        quantity: "3",
      }),
    ).rejects.toBeInstanceOf(FreightRuleNotFoundError);

    expect(
      await db.auditLog.count({
        where: {
          actorUserId: adminContext.actor.userId,
          requestId: adminContext.requestId,
        },
      }),
    ).toBeGreaterThanOrEqual(12);
  });
});
