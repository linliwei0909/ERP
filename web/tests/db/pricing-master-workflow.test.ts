import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import { AuthorizationError } from "../../src/lib/auth/authorization";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";
import {
  createItemPriceVersion,
  createPriceAssignment,
  createPriceList,
  getEffectivePrice,
  PriceNotFoundError,
  PricingConstraintError,
} from "../../src/lib/pricing/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P2.4 pricing master workflows", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  const suffix = randomUUID().slice(0, 8);
  let companyA: { id: string; code: string; name: string };
  let companyB: { id: string; code: string; name: string };
  let companyC: { id: string; code: string; name: string };
  let adminContext: RequestContext;
  let orderContext: RequestContext;
  let adminId: string;
  let customerId: string;
  let itemId: string;

  beforeAll(async () => {
    [companyA, companyB, companyC] = await Promise.all([
      db.company.create({ data: { code: `PA-${suffix}`, name: `價格 A ${suffix}` } }),
      db.company.create({ data: { code: `PB-${suffix}`, name: `價格 B ${suffix}` } }),
      db.company.create({ data: { code: `PC-${suffix}`, name: `價格 C ${suffix}` } }),
    ]);
    const [adminRole, orderRole] = await Promise.all([
      db.role.upsert({ where: { code: "ADMIN" }, update: {}, create: { code: "ADMIN", name: "管理員" } }),
      db.role.upsert({ where: { code: "ORDER_ENTRY" }, update: {}, create: { code: "ORDER_ENTRY", name: "訂單輸入人員" } }),
    ]);
    const [admin, order] = await Promise.all([
      db.user.create({ data: { username: `pricing-admin-${suffix}`, normalizedUsername: `pricing-admin-${suffix}`, passwordHash: "test", defaultCompanyId: companyA.id } }),
      db.user.create({ data: { username: `pricing-order-${suffix}`, normalizedUsername: `pricing-order-${suffix}`, passwordHash: "test", defaultCompanyId: companyA.id } }),
    ]);
    adminId = admin.id;
    await Promise.all([
      db.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } }),
      db.userRole.create({ data: { userId: order.id, roleId: orderRole.id } }),
      db.userCompanyScope.create({ data: { userId: admin.id, companyId: companyA.id } }),
      db.userCompanyScope.create({ data: { userId: admin.id, companyId: companyB.id } }),
      db.userCompanyScope.create({ data: { userId: order.id, companyId: companyA.id } }),
    ]);
    const [adminSession, orderSession] = await Promise.all([
      db.userSession.create({ data: { userId: admin.id, tokenHash: `pricing-a-${randomUUID()}`, selectedCompanyId: companyA.id } }),
      db.userSession.create({ data: { userId: order.id, tokenHash: `pricing-o-${randomUUID()}`, selectedCompanyId: companyA.id } }),
    ]);
    adminContext = {
      actor: { userId: admin.id, username: admin.username }, session: { sessionId: adminSession.id },
      requestId: `pricing-admin-${suffix}`, roleCodes: ["ADMIN"],
      authorizedCompanies: [companyA, companyB], selectedCompany: companyA,
    };
    orderContext = {
      actor: { userId: order.id, username: order.username }, session: { sessionId: orderSession.id },
      requestId: `pricing-order-${suffix}`, roleCodes: ["ORDER_ENTRY"],
      authorizedCompanies: [companyA], selectedCompany: companyA,
    };
    const customer = await db.customer.create({
      data: { customerType: "DOMESTIC", name: `價格客戶 ${suffix}`, createdById: admin.id, updatedById: admin.id },
    });
    customerId = customer.id;
    await db.customerCompany.create({
      data: { customerId, companyId: companyA.id, customerCode: `C-${suffix}`, normalizedCustomerCode: `C-${suffix}`, createdById: admin.id, updatedById: admin.id },
    });
    const item = await db.item.create({
      data: {
        code: `I-${suffix}`, normalizedCode: `I-${suffix}`, name: `價格品項 ${suffix}`, baseUnit: "PCS",
        itemType: "PRODUCT", salesEnabled: true, createdById: admin.id, updatedById: admin.id,
      },
    });
    itemId = item.id;
    await db.itemCompany.create({
      data: {
        itemId, companyId: companyA.id, companyItemCode: `I-${suffix}`, normalizedCompanyItemCode: `I-${suffix}`,
        salesEnabled: true, createdById: admin.id, updatedById: admin.id,
      },
    });
  });

  afterAll(async () => db.$disconnect());

  async function list(code: string, companyId = companyA.id) {
    const result = await createPriceList(db, {
      context: adminContext, companyId, priceList: { code, name: `價格表 ${code}` }, idempotencyKey: randomUUID(),
    });
    return db.priceList.findUniqueOrThrow({ where: { id: result.id } });
  }

  async function customerWithCompany(label: string) {
    const customer = await db.customer.create({
      data: {
        customerType: "DOMESTIC",
        name: `價格客戶 ${label} ${suffix}`,
        createdById: adminId,
        updatedById: adminId,
      },
    });
    await db.customerCompany.create({
      data: {
        customerId: customer.id,
        companyId: companyA.id,
        customerCode: `${label}-${suffix}`,
        normalizedCustomerCode: `${label}-${suffix}`.toUpperCase(),
        createdById: adminId,
        updatedById: adminId,
      },
    });
    return customer.id;
  }

  it("enforces normalized price-list code per company and permits another company", async () => {
    await list(`Ｎ-${suffix}`);
    await expect(list(` n-${suffix} `)).rejects.toBeInstanceOf(PricingConstraintError);
    await list(`Ｎ-${suffix}`, companyB.id);
  });

  it("stores five decimals, accepts zero and rejects negative prices", async () => {
    const priceList = await list(`DEC-${suffix}`);
    const five = await createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "12.34567", validFrom: "2026-01-01", validTo: "2026-02-01" },
      idempotencyKey: randomUUID(),
    });
    expect((await db.itemPrice.findUniqueOrThrow({ where: { id: five.id } })).unitPrice.toFixed(5)).toBe("12.34567");
    await createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "0", validFrom: "2026-02-01" }, idempotencyKey: randomUUID(),
    });
    await expect(createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "-1", validFrom: "2027-01-01" }, idempotencyKey: randomUUID(),
    })).rejects.toThrow();
  });

  it("rejects invalid and overlapping item periods but accepts adjacent/open periods", async () => {
    const priceList = await list(`PER-${suffix}`);
    await expect(createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "1", validFrom: "2026-02-01", validTo: "2026-01-01" }, idempotencyKey: randomUUID(),
    })).rejects.toThrow();
    await createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "1", validFrom: "2026-01-01", validTo: "2026-02-01", status: "INACTIVE" }, idempotencyKey: randomUUID(),
    });
    await expect(createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "2", validFrom: "2026-01-15", validTo: "2026-03-01" }, idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(PricingConstraintError);
    await createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "2", validFrom: "2026-02-01" }, idempotencyKey: randomUUID(),
    });
    await expect(createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "3", validFrom: "2030-01-01" }, idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(PricingConstraintError);
  });

  it("rejects assignment overlaps regardless of status and accepts adjacency", async () => {
    const priceList = await list(`ASN-${suffix}`);
    const assignmentCustomerId = await customerWithCompany("ASN");
    await createPriceAssignment(db, {
      context: adminContext, companyId: companyA.id,
      assignment: { customerId: assignmentCustomerId, priceListId: priceList.id, validFrom: "2026-01-01", validTo: "2026-02-01", status: "INACTIVE" },
      idempotencyKey: randomUUID(),
    });
    await expect(createPriceAssignment(db, {
      context: adminContext, companyId: companyA.id,
      assignment: { customerId: assignmentCustomerId, priceListId: priceList.id, validFrom: "2026-01-15", validTo: "2026-03-01" },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(PricingConstraintError);
    await createPriceAssignment(db, {
      context: adminContext, companyId: companyA.id,
      assignment: { customerId: assignmentCustomerId, priceListId: priceList.id, validFrom: "2026-02-01" },
      idempotencyKey: randomUUID(),
    });
    await expect(createPriceAssignment(db, {
      context: adminContext, companyId: companyA.id,
      assignment: { customerId: assignmentCustomerId, priceListId: priceList.id, validFrom: "2030-01-01" },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(PricingConstraintError);
  });

  it("enforces customer-company and price-list-company composite FKs", async () => {
    const listB = await list(`FK-${suffix}`, companyB.id);
    await expect(createPriceAssignment(db, {
      context: adminContext, companyId: companyA.id,
      assignment: { customerId, priceListId: listB.id, validFrom: "2028-01-01" }, idempotencyKey: randomUUID(),
    })).rejects.toThrow("找不到價格表");
    const noRelationCustomer = await db.customer.create({
      data: { customerType: "DOMESTIC", name: "無公司客戶", createdById: adminId, updatedById: adminId },
    });
    await expect(createPriceAssignment(db, {
      context: adminContext, companyId: companyA.id,
      assignment: { customerId: noRelationCustomer.id, priceListId: listB.id, validFrom: "2028-01-01" }, idempotencyKey: randomUUID(),
    })).rejects.toThrow("客戶未授權給此公司");
    await expect(db.customerPriceListAssignment.create({
      data: {
        customerId, companyId: companyA.id, priceListId: listB.id, validFrom: new Date("2030-01-01"),
        createdById: adminId, updatedById: adminId,
      },
    })).rejects.toThrow();
    await db.customerCompany.create({
      data: {
        customerId,
        companyId: companyB.id,
        customerCode: `CB-${suffix}`,
        normalizedCustomerCode: `CB-${suffix}`,
        createdById: adminId,
        updatedById: adminId,
      },
    });
    await expect(createPriceAssignment(db, {
      context: adminContext,
      companyId: companyB.id,
      assignment: { customerId, priceListId: listB.id, validFrom: "2028-01-01" },
      idempotencyKey: randomUUID(),
    })).resolves.toMatchObject({ replayed: false });
  });

  it("looks up the correct effective version and honors the exclusive end boundary", async () => {
    const priceList = await list(`LOOK-${suffix}`);
    await createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "10", validFrom: "2026-01-01", validTo: "2026-02-01" }, idempotencyKey: randomUUID(),
    });
    await createItemPriceVersion(db, {
      context: adminContext, companyId: companyA.id, priceListId: priceList.id,
      price: { itemId, unitPrice: "20", validFrom: "2026-02-01" }, idempotencyKey: randomUUID(),
    });
    await createPriceAssignment(db, {
      context: adminContext, companyId: companyA.id,
      assignment: { customerId, priceListId: priceList.id, validFrom: "2026-01-01" }, idempotencyKey: randomUUID(),
    });
    expect((await getEffectivePrice(db, {
      context: orderContext, companyId: companyA.id, customerId, itemId, effectiveDate: "2026-01-31",
    })).unitPrice).toBe("10.00000");
    expect((await getEffectivePrice(db, {
      context: orderContext, companyId: companyA.id, customerId, itemId, effectiveDate: "2026-02-01",
    })).unitPrice).toBe("20.00000");
  });

  it("returns PRICE_NOT_FOUND for missing or non-saleable item relationships", async () => {
    await expect(getEffectivePrice(db, {
      context: orderContext, companyId: companyA.id, customerId, itemId, effectiveDate: "2025-01-01",
    })).rejects.toBeInstanceOf(PriceNotFoundError);
    const unassignedItem = await db.item.create({
      data: {
        code: `UNASSIGNED-${suffix}`,
        normalizedCode: `UNASSIGNED-${suffix}`,
        name: "未授權品項",
        baseUnit: "PCS",
        itemType: "PRODUCT",
        salesEnabled: true,
        createdById: adminId,
        updatedById: adminId,
      },
    });
    await expect(getEffectivePrice(db, {
      context: orderContext,
      companyId: companyA.id,
      customerId,
      itemId: unassignedItem.id,
      effectiveDate: "2026-02-01",
    })).rejects.toBeInstanceOf(PriceNotFoundError);
    await db.itemCompany.update({
      where: { itemId_companyId: { itemId, companyId: companyA.id } }, data: { salesEnabled: false },
    });
    await expect(getEffectivePrice(db, {
      context: orderContext, companyId: companyA.id, customerId, itemId, effectiveDate: "2026-02-01",
    })).rejects.toBeInstanceOf(PriceNotFoundError);
    await db.itemCompany.update({
      where: { itemId_companyId: { itemId, companyId: companyA.id } }, data: { salesEnabled: true },
    });
    const assignment = await db.customerPriceListAssignment.findFirstOrThrow({
      where: { customerId, companyId: companyA.id },
    });
    const price = await db.itemPrice.findFirstOrThrow({
      where: { priceListId: assignment.priceListId, itemId },
    });
    await db.customerPriceListAssignment.update({
      where: { id: assignment.id }, data: { status: "INACTIVE" },
    });
    await expect(getEffectivePrice(db, {
      context: orderContext, companyId: companyA.id, customerId, itemId, effectiveDate: "2026-01-15",
    })).rejects.toBeInstanceOf(PriceNotFoundError);
    await db.customerPriceListAssignment.update({
      where: { id: assignment.id }, data: { status: "ACTIVE" },
    });
    await db.priceList.update({
      where: { id: assignment.priceListId }, data: { status: "INACTIVE" },
    });
    await expect(getEffectivePrice(db, {
      context: orderContext, companyId: companyA.id, customerId, itemId, effectiveDate: "2026-01-15",
    })).rejects.toBeInstanceOf(PriceNotFoundError);
    await db.priceList.update({
      where: { id: assignment.priceListId }, data: { status: "ACTIVE" },
    });
    await db.itemPrice.update({ where: { id: price.id }, data: { status: "INACTIVE" } });
    await expect(getEffectivePrice(db, {
      context: orderContext, companyId: companyA.id, customerId, itemId, effectiveDate: "2026-01-15",
    })).rejects.toBeInstanceOf(PriceNotFoundError);
    await db.itemPrice.update({ where: { id: price.id }, data: { status: "ACTIVE" } });
  });

  it("allows ADMIN writes, rejects ORDER_ENTRY writes and forged companies", async () => {
    await expect(createPriceList(db, {
      context: orderContext, companyId: companyA.id, priceList: { code: `NO-${suffix}`, name: "不得建立" }, idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(getEffectivePrice(db, {
      context: orderContext, companyId: companyC.id, customerId, itemId, effectiveDate: "2026-01-01",
    })).rejects.toBeInstanceOf(CompanyAccessError);
  });

  it("replays idempotently and rolls back when audit persistence fails", async () => {
    const key = randomUUID();
    const input = {
      context: adminContext, companyId: companyA.id, priceList: { code: `IDEM-${suffix}`, name: "冪等價格表" }, idempotencyKey: key,
    };
    const first = await createPriceList(db, input);
    expect(await createPriceList(db, input)).toEqual({ id: first.id, replayed: true });
    expect(await db.priceList.count({ where: { id: first.id } })).toBe(1);
    const invalid = { ...adminContext, session: { sessionId: randomUUID() } };
    await expect(createPriceList(db, {
      context: invalid, companyId: companyA.id, priceList: { code: `ROLL-${suffix}`, name: "不得保留" }, idempotencyKey: randomUUID(),
    })).rejects.toThrow();
    expect(await db.priceList.count({ where: { normalizedCode: `ROLL-${suffix}` } })).toBe(0);
  });

  it("installs pricing constraints and no prohibited tables", async () => {
    const names = await db.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name FROM pg_constraint
      WHERE conname IN (
        'item_prices_unit_price_nonnegative_check',
        'item_prices_valid_period_check',
        'item_prices_period_exclusion',
        'price_assignments_valid_period_check',
        'price_assignments_period_exclusion',
        'customer_price_list_assignments_customer_id_company_id_fkey',
        'customer_price_list_assignments_price_list_id_company_id_fkey'
      )
    `;
    expect(names).toHaveLength(7);
    const prohibited = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
        ('orders','sales_orders','inventory','warehouses','procurement')
    `;
    expect(prohibited).toEqual([]);
  });
});
