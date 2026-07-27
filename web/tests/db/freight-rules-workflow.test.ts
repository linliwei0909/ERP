import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import { AuthorizationError } from "../../src/lib/auth/authorization";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";
import {
  createFreightRule,
  FreightConstraintError,
  FreightEntityNotFoundError,
  FreightRuleNotFoundError,
  FreightRuleStateError,
  quoteFreight,
  updateFreightRule,
} from "../../src/lib/freight/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P2.5 freight rule workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyA: { id: string; code: string; name: string };
  let companyB: { id: string; code: string; name: string };
  let companyC: { id: string; code: string; name: string };
  let adminContext: RequestContext;
  let orderContext: RequestContext;
  let adminId: string;
  let customerId: string;
  let locationId: string;

  beforeAll(async () => {
    [companyA, companyB, companyC] = await Promise.all([
      db.company.create({ data: { code: `FA-${suffix}`, name: `運費 A ${suffix}` } }),
      db.company.create({ data: { code: `FB-${suffix}`, name: `運費 B ${suffix}` } }),
      db.company.create({ data: { code: `FC-${suffix}`, name: `運費 C ${suffix}` } }),
    ]);
    const [adminRole, orderRole] = await Promise.all([
      db.role.upsert({
        where: { code: "ADMIN" },
        update: {},
        create: { code: "ADMIN", name: "管理員" },
      }),
      db.role.upsert({
        where: { code: "ORDER_ENTRY" },
        update: {},
        create: { code: "ORDER_ENTRY", name: "訂單輸入人員" },
      }),
    ]);
    const [admin, order] = await Promise.all([
      db.user.create({
        data: {
          username: `freight-admin-${suffix}`,
          normalizedUsername: `freight-admin-${suffix}`,
          passwordHash: "test",
          defaultCompanyId: companyA.id,
        },
      }),
      db.user.create({
        data: {
          username: `freight-order-${suffix}`,
          normalizedUsername: `freight-order-${suffix}`,
          passwordHash: "test",
          defaultCompanyId: companyA.id,
        },
      }),
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
      db.userSession.create({
        data: {
          userId: admin.id,
          tokenHash: `freight-a-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
      db.userSession.create({
        data: {
          userId: order.id,
          tokenHash: `freight-o-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
    ]);
    adminContext = {
      actor: { userId: admin.id, username: admin.username },
      session: { sessionId: adminSession.id },
      requestId: `freight-admin-${suffix}`,
      roleCodes: ["ADMIN"],
      authorizedCompanies: [companyA, companyB],
      selectedCompany: companyA,
    };
    orderContext = {
      actor: { userId: order.id, username: order.username },
      session: { sessionId: orderSession.id },
      requestId: `freight-order-${suffix}`,
      roleCodes: ["ORDER_ENTRY"],
      authorizedCompanies: [companyA],
      selectedCompany: companyA,
    };
    const target = await createCustomerLocation("MAIN");
    customerId = target.customerId;
    locationId = target.locationId;
  });

  afterAll(async () => db.$disconnect());

  async function createCustomerLocation(label: string) {
    const customer = await db.customer.create({
      data: {
        customerType: "DOMESTIC",
        name: `運費客戶 ${label} ${suffix}`,
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
    const location = await db.deliveryLocation.create({
      data: {
        customerId: customer.id,
        code: `L-${label}`,
        name: `地點 ${label}`,
        recipientName: "收件人",
        phone: "02-00000000",
        addressLine: "測試地址",
        fullAddress: "測試地址",
        createdById: adminId,
        updatedById: adminId,
      },
    });
    return { customerId: customer.id, locationId: location.id };
  }

  async function createRule(input: {
    customerId: string;
    locationId: string;
    mode: "NO_CHARGE" | "QUANTITY_BASED" | "FIXED_PER_LOCATION";
    unitFreight?: string | null;
    fixedFreight?: string | null;
    validFrom: string;
    validTo?: string | null;
    status?: "ACTIVE" | "INACTIVE";
    companyId?: string;
    context?: RequestContext;
    key?: string;
  }) {
    return createFreightRule(db, {
      context: input.context ?? adminContext,
      companyId: input.companyId ?? companyA.id,
      freightRule: {
        customerId: input.customerId,
        deliveryLocationId: input.locationId,
        mode: input.mode,
        unitFreight: input.unitFreight ?? null,
        fixedFreight: input.fixedFreight ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
        status: input.status ?? "ACTIVE",
      },
      idempotencyKey: input.key ?? randomUUID(),
    });
  }

  it("enforces mode combinations, nonnegative amounts and zero-value rules", async () => {
    const zero = await createCustomerLocation("ZERO");
    await expect(
      createRule({
        ...zero,
        mode: "QUANTITY_BASED",
        unitFreight: "0",
        validFrom: "2026-01-01",
      }),
    ).resolves.toMatchObject({ replayed: false });
    await expect(
      db.freightRule.create({
        data: {
          customerId: zero.customerId,
          companyId: companyA.id,
          deliveryLocationId: zero.locationId,
          mode: "NO_CHARGE",
          unitFreight: 1,
          validFrom: new Date("2030-01-01"),
          createdById: adminId,
          updatedById: adminId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.freightRule.create({
        data: {
          customerId: zero.customerId,
          companyId: companyA.id,
          deliveryLocationId: zero.locationId,
          mode: "FIXED_PER_LOCATION",
          fixedFreight: -1,
          validFrom: new Date("2030-01-01"),
          createdById: adminId,
          updatedById: adminId,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid and overlapping periods but accepts adjacency and open end", async () => {
    const target = await createCustomerLocation("PERIOD");
    await expect(
      createRule({
        ...target,
        mode: "NO_CHARGE",
        validFrom: "2026-02-01",
        validTo: "2026-01-01",
      }),
    ).rejects.toThrow();
    await createRule({
      ...target,
      mode: "NO_CHARGE",
      validFrom: "2026-01-01",
      validTo: "2026-02-01",
      status: "INACTIVE",
    });
    await expect(
      createRule({
        ...target,
        mode: "FIXED_PER_LOCATION",
        fixedFreight: "10",
        validFrom: "2026-01-15",
        validTo: "2026-03-01",
      }),
    ).rejects.toBeInstanceOf(FreightConstraintError);
    await createRule({
      ...target,
      mode: "FIXED_PER_LOCATION",
      fixedFreight: "10",
      validFrom: "2026-02-01",
    });
    await expect(
      createRule({
        ...target,
        mode: "NO_CHARGE",
        validFrom: "2030-01-01",
      }),
    ).rejects.toBeInstanceOf(FreightConstraintError);
  });

  it("enforces customer-company and delivery-customer composite relationships", async () => {
    const other = await createCustomerLocation("OTHER");
    await expect(
      db.freightRule.create({
        data: {
          customerId,
          companyId: companyB.id,
          deliveryLocationId: locationId,
          mode: "NO_CHARGE",
          validFrom: new Date("2030-01-01"),
          createdById: adminId,
          updatedById: adminId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.freightRule.create({
        data: {
          customerId,
          companyId: companyA.id,
          deliveryLocationId: other.locationId,
          mode: "NO_CHARGE",
          validFrom: new Date("2030-01-01"),
          createdById: adminId,
          updatedById: adminId,
        },
      }),
    ).rejects.toThrow();
    const noRelation = await db.customer.create({
      data: {
        customerType: "DOMESTIC",
        name: "無公司關係客戶",
        createdById: adminId,
        updatedById: adminId,
      },
    });
    const noRelationLocation = await db.deliveryLocation.create({
      data: {
        customerId: noRelation.id,
        code: `NR-${suffix}`,
        name: "未授權地點",
        recipientName: "收件人",
        phone: "02-00000000",
        addressLine: "測試地址",
        fullAddress: "測試地址",
        createdById: adminId,
        updatedById: adminId,
      },
    });
    await expect(
      createRule({
        customerId: noRelation.id,
        locationId: noRelationLocation.id,
        mode: "NO_CHARGE",
        validFrom: "2030-01-01",
      }),
    ).rejects.toBeInstanceOf(FreightEntityNotFoundError);
  });

  it("calculates all modes and honors effective-date boundaries", async () => {
    await createRule({
      customerId,
      locationId,
      mode: "QUANTITY_BASED",
      unitFreight: "3",
      validFrom: "2026-01-01",
      validTo: "2026-02-01",
    });
    await createRule({
      customerId,
      locationId,
      mode: "FIXED_PER_LOCATION",
      fixedFreight: "125",
      validFrom: "2026-02-01",
    });
    expect(
      (
        await quoteFreight(db, {
          context: orderContext,
          companyId: companyA.id,
          customerId,
          deliveryLocationId: locationId,
          effectiveDate: "2026-01-31",
          quantity: "1.2345",
        })
      ).freightAmount,
    ).toBe("4");
    expect(
      (
        await quoteFreight(db, {
          context: orderContext,
          companyId: companyA.id,
          customerId,
          deliveryLocationId: locationId,
          effectiveDate: "2026-02-01",
          quantity: "999",
        })
      ).freightAmount,
    ).toBe("125");
    const free = await createCustomerLocation("FREE");
    await createRule({
      ...free,
      mode: "NO_CHARGE",
      validFrom: "2026-01-01",
    });
    expect(
      (
        await quoteFreight(db, {
          context: orderContext,
          companyId: companyA.id,
          customerId: free.customerId,
          deliveryLocationId: free.locationId,
          effectiveDate: "2026-01-01",
          quantity: "50",
        })
      ).freightAmount,
    ).toBe("0");
  });

  it("returns FREIGHT_RULE_NOT_FOUND without applying a fallback", async () => {
    const missing = await createCustomerLocation("MISSING");
    await expect(
      quoteFreight(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId: missing.customerId,
        deliveryLocationId: missing.locationId,
        effectiveDate: "2026-01-01",
        quantity: "1",
      }),
    ).rejects.toMatchObject({ code: "FREIGHT_RULE_NOT_FOUND" });
  });

  it("allows future rule changes but protects effective mode and amounts", async () => {
    const future = await createCustomerLocation("FUTURE");
    const created = await createRule({
      ...future,
      mode: "NO_CHARGE",
      validFrom: "2035-01-01",
    });
    await expect(
      updateFreightRule(db, {
        context: adminContext,
        companyId: companyA.id,
        freightRuleId: created.id,
        freightRule: {
          customerId: future.customerId,
          deliveryLocationId: future.locationId,
          mode: "FIXED_PER_LOCATION",
          fixedFreight: "50",
          unitFreight: null,
          validFrom: "2035-01-01",
          validTo: null,
          status: "ACTIVE",
        },
        idempotencyKey: randomUUID(),
        now: new Date("2026-07-25T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ replayed: false });
    expect(
      await db.freightRule.findUniqueOrThrow({ where: { id: created.id } }),
    ).toMatchObject({ mode: "FIXED_PER_LOCATION" });
    const effective = await db.freightRule.findFirstOrThrow({
      where: {
        customerId,
        companyId: companyA.id,
        validFrom: new Date("2026-01-01"),
      },
    });
    await expect(
      updateFreightRule(db, {
        context: adminContext,
        companyId: companyA.id,
        freightRuleId: effective.id,
        freightRule: {
          customerId,
          deliveryLocationId: locationId,
          mode: "NO_CHARGE",
          unitFreight: null,
          fixedFreight: null,
          validFrom: "2026-01-01",
          validTo: "2026-02-01",
          status: "ACTIVE",
        },
        idempotencyKey: randomUUID(),
        now: new Date("2026-07-25T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(FreightRuleStateError);
  });

  it("rejects inactive customer, company relation, location and rule", async () => {
    const rule = await db.freightRule.findFirstOrThrow({
      where: { customerId, companyId: companyA.id, validFrom: new Date("2026-01-01") },
    });
    const quote = () =>
      quoteFreight(db, {
        context: orderContext,
        companyId: companyA.id,
        customerId,
        deliveryLocationId: locationId,
        effectiveDate: "2026-01-15",
        quantity: "1",
      });
    await db.customer.update({ where: { id: customerId }, data: { status: "INACTIVE" } });
    await expect(quote()).rejects.toBeInstanceOf(FreightRuleNotFoundError);
    await db.customer.update({ where: { id: customerId }, data: { status: "ACTIVE" } });
    await db.customerCompany.update({
      where: { customerId_companyId: { customerId, companyId: companyA.id } },
      data: { status: "INACTIVE" },
    });
    await expect(quote()).rejects.toBeInstanceOf(FreightRuleNotFoundError);
    await db.customerCompany.update({
      where: { customerId_companyId: { customerId, companyId: companyA.id } },
      data: { status: "ACTIVE" },
    });
    await db.deliveryLocation.update({ where: { id: locationId }, data: { status: "INACTIVE" } });
    await expect(quote()).rejects.toBeInstanceOf(FreightRuleNotFoundError);
    await db.deliveryLocation.update({ where: { id: locationId }, data: { status: "ACTIVE" } });
    await db.freightRule.update({ where: { id: rule.id }, data: { status: "INACTIVE" } });
    await expect(quote()).rejects.toBeInstanceOf(FreightRuleNotFoundError);
    await db.freightRule.update({ where: { id: rule.id }, data: { status: "ACTIVE" } });
  });

  it("allows ADMIN writes, rejects ORDER_ENTRY writes and forged companies", async () => {
    const target = await createCustomerLocation("RBAC");
    await expect(
      createRule({
        ...target,
        mode: "NO_CHARGE",
        validFrom: "2026-01-01",
        context: orderContext,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      quoteFreight(db, {
        context: orderContext,
        companyId: companyC.id,
        customerId,
        deliveryLocationId: locationId,
        effectiveDate: "2026-01-01",
        quantity: "1",
      }),
    ).rejects.toBeInstanceOf(CompanyAccessError);
  });

  it("replays idempotently and rolls back when audit persistence fails", async () => {
    const target = await createCustomerLocation("IDEM");
    const key = randomUUID();
    const first = await createRule({
      ...target,
      mode: "NO_CHARGE",
      validFrom: "2026-01-01",
      key,
    });
    expect(
      await createRule({
        ...target,
        mode: "NO_CHARGE",
        validFrom: "2026-01-01",
        key,
      }),
    ).toEqual({ id: first.id, replayed: true });
    expect(await db.freightRule.count({ where: { id: first.id } })).toBe(1);
    const rollback = await createCustomerLocation("ROLL");
    const invalidContext = {
      ...adminContext,
      session: { sessionId: randomUUID() },
    };
    await expect(
      createRule({
        ...rollback,
        mode: "NO_CHARGE",
        validFrom: "2026-01-01",
        context: invalidContext,
      }),
    ).rejects.toThrow();
    expect(
      await db.freightRule.count({
        where: { deliveryLocationId: rollback.locationId },
      }),
    ).toBe(0);
  });

  it("installs freight constraints and no prohibited tables", async () => {
    const names = await db.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name FROM pg_constraint
      WHERE conname IN (
        'freight_rules_amount_nonnegative_check',
        'freight_rules_mode_amount_check',
        'freight_rules_valid_period_check',
        'freight_rules_period_exclusion',
        'freight_rules_customer_id_company_id_fkey',
        'freight_rules_delivery_location_id_customer_id_fkey'
      )
    `;
    expect(names).toHaveLength(6);
    const prohibited = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
        ('orders','delivery_notes','inventory','warehouses','procurement')
    `;
    expect(prohibited).toEqual([]);
  });
});
