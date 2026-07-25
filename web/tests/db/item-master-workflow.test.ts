import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Item } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import { AuthorizationError } from "../../src/lib/auth/authorization";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";
import {
  assignItemCompany,
  createItem,
  getItem,
  ItemConstraintError,
  ItemNotFoundError,
  listAvailableItems,
  listItems,
  listSaleableItems,
  updateItem,
} from "../../src/lib/items/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P2.3 item master workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyAId: string;
  let companyBId: string;
  let companyCId: string;
  let adminContext: RequestContext;
  let orderContext: RequestContext;
  let adminUserId: string;

  beforeAll(async () => {
    const [companyA, companyB, companyC] = await Promise.all([
      db.company.create({
        data: { code: `IA-${suffix}`, name: `品項測試 A ${suffix}` },
      }),
      db.company.create({
        data: { code: `IB-${suffix}`, name: `品項測試 B ${suffix}` },
      }),
      db.company.create({
        data: { code: `IC-${suffix}`, name: `品項測試 C ${suffix}` },
      }),
    ]);
    companyAId = companyA.id;
    companyBId = companyB.id;
    companyCId = companyC.id;
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
          username: `item-admin-${suffix}`,
          normalizedUsername: `item-admin-${suffix}`,
          passwordHash: "integration-test-hash",
          defaultCompanyId: companyA.id,
        },
      }),
      db.user.create({
        data: {
          username: `item-order-${suffix}`,
          normalizedUsername: `item-order-${suffix}`,
          passwordHash: "integration-test-hash",
          defaultCompanyId: companyA.id,
        },
      }),
    ]);
    adminUserId = admin.id;
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
          tokenHash: `item-admin-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
      db.userSession.create({
        data: {
          userId: order.id,
          tokenHash: `item-order-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
    ]);
    adminContext = {
      actor: { userId: admin.id, username: admin.username },
      session: { sessionId: adminSession.id },
      requestId: `item-admin-${suffix}`,
      roleCodes: ["ADMIN"],
      authorizedCompanies: [
        { id: companyA.id, code: companyA.code, name: companyA.name },
        { id: companyB.id, code: companyB.code, name: companyB.name },
      ],
      selectedCompany: {
        id: companyA.id,
        code: companyA.code,
        name: companyA.name,
      },
    };
    orderContext = {
      actor: { userId: order.id, username: order.username },
      session: { sessionId: orderSession.id },
      requestId: `item-order-${suffix}`,
      roleCodes: ["ORDER_ENTRY"],
      authorizedCompanies: [
        { id: companyA.id, code: companyA.code, name: companyA.name },
      ],
      selectedCompany: {
        id: companyA.id,
        code: companyA.code,
        name: companyA.name,
      },
    };
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function saleableItem(
    code: string,
    options: {
      barcode?: string | null;
      companyId?: string;
      itemSales?: boolean;
      companySales?: boolean;
    } = {},
  ): Promise<Item> {
    const result = await createItem(db, {
      context: adminContext,
      companyId: options.companyId ?? companyAId,
      item: {
        code,
        name: `品項 ${code}`,
        baseUnit: "PCS",
        barcode: options.barcode,
        itemType: "PRODUCT",
        salesEnabled: options.itemSales ?? true,
      },
      companyRelation: {
        companyItemCode: code,
        salesEnabled: options.companySales ?? true,
      },
      idempotencyKey: randomUUID(),
    });
    return db.item.findUniqueOrThrow({ where: { id: result.id } });
  }

  it("creates an item with audit and idempotent replay", async () => {
    const key = randomUUID();
    const input = {
      context: adminContext,
      companyId: companyAId,
      item: {
        code: `IDEM-${suffix}`,
        name: "冪等品項",
        baseUnit: "PCS",
        itemType: "PRODUCT" as const,
        salesEnabled: true,
      },
      companyRelation: {
        companyItemCode: `IDEM-${suffix}`,
        salesEnabled: true,
      },
      idempotencyKey: key,
    };
    const first = await createItem(db, input);
    const replay = await createItem(db, input);
    expect(replay).toEqual({ id: first.id, replayed: true });
    expect(await db.item.count({ where: { id: first.id } })).toBe(1);
    expect(
      await db.auditLog.count({
        where: { entityId: first.id, operation: "item.created" },
      }),
    ).toBe(1);
  });

  it("enforces globally unique normalized item codes", async () => {
    await saleableItem(`Ｎ-${suffix}`);
    await expect(saleableItem(` n-${suffix} `)).rejects.toBeInstanceOf(
      ItemConstraintError,
    );
  });

  it("enforces non-empty required text in application and database", async () => {
    await expect(
      createItem(db, {
        context: adminContext,
        companyId: companyAId,
        item: {
          code: " ",
          name: " ",
          baseUnit: " ",
          itemType: "PRODUCT",
        },
        companyRelation: { companyItemCode: " " },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      db.item.create({
        data: {
          code: " ",
          normalizedCode: " ",
          name: " ",
          baseUnit: " ",
          itemType: "PRODUCT",
          createdById: adminUserId,
          updatedById: adminUserId,
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces non-empty unique barcodes while allowing multiple nulls", async () => {
    await saleableItem(`BAR-A-${suffix}`, { barcode: ` B-${suffix} ` });
    await expect(
      saleableItem(`BAR-B-${suffix}`, { barcode: `B-${suffix}` }),
    ).rejects.toBeInstanceOf(ItemConstraintError);
    await saleableItem(`NULL-A-${suffix}`, { barcode: null });
    await saleableItem(`NULL-B-${suffix}`, { barcode: null });
  });

  it("supports shared items and company-scoped item codes", async () => {
    const item = await saleableItem(`SHARED-${suffix}`);
    await assignItemCompany(db, {
      context: adminContext,
      companyId: companyBId,
      itemId: item.id,
      relation: {
        companyItemCode: `SHARED-${suffix}`,
        salesEnabled: true,
      },
      idempotencyKey: randomUUID(),
    });
    expect(
      await db.itemCompany.count({ where: { itemId: item.id } }),
    ).toBe(2);

    const another = await saleableItem(`OTHER-${suffix}`, {
      companyId: companyAId,
    });
    await assignItemCompany(db, {
      context: adminContext,
      companyId: companyAId,
      itemId: another.id,
      relation: {
        companyItemCode: `SAME-${suffix}`,
        salesEnabled: true,
      },
      idempotencyKey: randomUUID(),
    });
    await expect(
      assignItemCompany(db, {
        context: adminContext,
        companyId: companyAId,
        itemId: item.id,
        relation: {
          companyItemCode: ` same-${suffix} `,
          salesEnabled: true,
        },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ItemConstraintError);
  });

  it("prevents duplicate item-company rows in the database", async () => {
    const item = await saleableItem(`REL-${suffix}`);
    await expect(
      db.itemCompany.create({
        data: {
          itemId: item.id,
          companyId: companyAId,
          companyItemCode: `REL2-${suffix}`,
          normalizedCompanyItemCode: `REL2-${suffix}`,
          createdById: adminUserId,
          updatedById: adminUserId,
        },
      }),
    ).rejects.toThrow();
  });

  it("restricts ORDER_ENTRY reads and all writes", async () => {
    const visible = await saleableItem(`VISIBLE-${suffix}`);
    const hidden = await saleableItem(`HIDDEN-${suffix}`, {
      companyId: companyBId,
    });
    const result = await listItems(db, {
      context: orderContext,
      companyId: companyAId,
      query: { availability: "ALL", search: suffix, pageSize: 100 },
    });
    expect(result.items.some((item) => item.id === visible.id)).toBe(true);
    expect(result.items.some((item) => item.id === hidden.id)).toBe(false);
    await expect(
      getItem(db, {
        context: orderContext,
        companyId: companyBId,
        itemId: hidden.id,
      }),
    ).rejects.toBeInstanceOf(CompanyAccessError);
    await expect(
      listItems(db, {
        context: orderContext,
        companyId: companyCId,
      }),
    ).rejects.toBeInstanceOf(CompanyAccessError);
    await expect(
      createItem(db, {
        context: orderContext,
        companyId: companyAId,
        item: {
          code: `DENIED-${suffix}`,
          name: "不得建立",
          baseUnit: "PCS",
          itemType: "PRODUCT",
        },
        companyRelation: { companyItemCode: `DENIED-${suffix}` },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("requires all four active and sales conditions for saleability", async () => {
    const globalOff = await saleableItem(`GLOBAL-OFF-${suffix}`, {
      itemSales: false,
    });
    const companyOff = await saleableItem(`COMPANY-OFF-${suffix}`, {
      companySales: false,
    });
    const itemInactive = await saleableItem(`ITEM-INACTIVE-${suffix}`);
    await updateItem(db, {
      context: adminContext,
      companyId: companyAId,
      itemId: itemInactive.id,
      item: {
        code: itemInactive.code,
        name: itemInactive.name,
        baseUnit: itemInactive.baseUnit,
        barcode: itemInactive.barcode,
        itemType: itemInactive.itemType,
        salesEnabled: true,
        status: "INACTIVE",
      },
      idempotencyKey: randomUUID(),
    });
    const relationInactive = await saleableItem(`REL-INACTIVE-${suffix}`);
    await assignItemCompany(db, {
      context: adminContext,
      companyId: companyAId,
      itemId: relationInactive.id,
      relation: {
        companyItemCode: relationInactive.code,
        salesEnabled: true,
        status: "INACTIVE",
      },
      idempotencyKey: randomUUID(),
    });

    const saleable = await listSaleableItems(db, {
      context: adminContext,
      companyId: companyAId,
      query: { search: suffix, pageSize: 100 },
    });
    for (const item of [
      globalOff,
      companyOff,
      itemInactive,
      relationInactive,
    ]) {
      expect(saleable.items.some((entry) => entry.id === item.id)).toBe(false);
    }
    const available = await listAvailableItems(db, {
      context: adminContext,
      companyId: companyAId,
      query: { search: `GLOBAL-OFF-${suffix}`, pageSize: 100 },
    });
    expect(available.items.some((entry) => entry.id === globalOff.id)).toBe(
      true,
    );
    await expect(
      getItem(db, {
        context: orderContext,
        companyId: companyAId,
        itemId: globalOff.id,
      }),
    ).rejects.toBeInstanceOf(ItemNotFoundError);
  });

  it("audits item and company deactivation and reactivation", async () => {
    const item = await saleableItem(`STATUS-${suffix}`);
    for (const status of ["INACTIVE", "ACTIVE"] as const) {
      await updateItem(db, {
        context: adminContext,
        companyId: companyAId,
        itemId: item.id,
        item: {
          code: item.code,
          name: item.name,
          baseUnit: item.baseUnit,
          barcode: item.barcode,
          itemType: item.itemType,
          salesEnabled: true,
          status,
        },
        idempotencyKey: randomUUID(),
      });
      await assignItemCompany(db, {
        context: adminContext,
        companyId: companyAId,
        itemId: item.id,
        relation: {
          companyItemCode: item.code,
          salesEnabled: true,
          status,
        },
        idempotencyKey: randomUUID(),
      });
    }
    expect(
      await db.auditLog.count({
        where: {
          entityId: item.id,
          operation: { in: ["item.deactivated", "item.activated"] },
        },
      }),
    ).toBe(2);
    expect(
      await db.auditLog.count({
        where: {
          entityType: "item_company",
          operation: {
            in: ["item_company.deactivated", "item_company.activated"],
          },
        },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it("rolls back item and audit when audit persistence fails", async () => {
    const invalidContext = {
      ...adminContext,
      session: { sessionId: randomUUID() },
    };
    const code = `ROLLBACK-${suffix}`;
    await expect(
      createItem(db, {
        context: invalidContext,
        companyId: companyAId,
        item: {
          code,
          name: "不得保留",
          baseUnit: "PCS",
          itemType: "PRODUCT",
        },
        companyRelation: { companyItemCode: code },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
    expect(
      await db.item.count({ where: { normalizedCode: code } }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          entityType: "item",
          operation: "item.created",
          afterJson: { path: ["name"], equals: "不得保留" },
        },
      }),
    ).toBe(0);
  });

  it("installs P2.3 constraints and no prohibited tables", async () => {
    const names = await db.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name FROM pg_constraint
      WHERE conname IN (
        'items_required_text_not_blank_check',
        'items_barcode_not_blank_check',
        'item_companies_code_not_blank_check'
      )
      UNION ALL
      SELECT indexname AS name FROM pg_indexes
      WHERE indexname IN (
        'items_normalized_code_key',
        'items_barcode_present_key',
        'item_companies_item_company_key',
        'item_companies_company_code_key'
      )
    `;
    expect(new Set(names.map((entry) => entry.name))).toEqual(
      new Set([
        "items_required_text_not_blank_check",
        "items_barcode_not_blank_check",
        "item_companies_code_not_blank_check",
        "items_normalized_code_key",
        "items_barcode_present_key",
        "item_companies_item_company_key",
        "item_companies_company_code_key",
      ]),
    );
    const prohibited = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'item_categories',
          'inventory',
          'inventories',
          'warehouses',
          'lots',
          'procurement',
          'stock_movements'
        )
    `;
    expect(prohibited).toEqual([]);
  });
});
