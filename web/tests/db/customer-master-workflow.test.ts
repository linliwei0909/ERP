import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  type Customer,
} from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import {
  assignCustomerCompany,
  createCustomer,
  CustomerConstraintError,
  getCustomer,
  listCustomers,
  saveCustomerContact,
  saveDeliveryLocation,
  updateCustomer,
} from "../../src/lib/customers/service";
import { AuthorizationError } from "../../src/lib/auth/authorization";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P2.2 customer master workflows", () => {
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
        data: { code: `CA-${suffix}`, name: `客戶測試 A ${suffix}` },
      }),
      db.company.create({
        data: { code: `CB-${suffix}`, name: `客戶測試 B ${suffix}` },
      }),
      db.company.create({
        data: { code: `CC-${suffix}`, name: `客戶測試 C ${suffix}` },
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
          username: `customer-admin-${suffix}`,
          normalizedUsername: `customer-admin-${suffix}`,
          passwordHash: "integration-test-hash",
          defaultCompanyId: companyA.id,
        },
      }),
      db.user.create({
        data: {
          username: `customer-order-${suffix}`,
          normalizedUsername: `customer-order-${suffix}`,
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
          tokenHash: `customer-admin-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
      db.userSession.create({
        data: {
          userId: order.id,
          tokenHash: `customer-order-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
    ]);
    adminContext = {
      actor: { userId: admin.id, username: admin.username },
      session: { sessionId: adminSession.id },
      requestId: `customer-admin-${suffix}`,
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
      requestId: `customer-order-${suffix}`,
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

  async function domestic(
    code: string,
    taxId?: string,
    companyId = companyAId,
  ): Promise<Customer> {
    const result = await createCustomer(db, {
      context: adminContext,
      companyId,
      customerCode: code,
      customer: {
        customerType: "DOMESTIC",
        name: `境內客戶 ${code}`,
        taxId,
      },
      idempotencyKey: randomUUID(),
    });
    return db.customer.findUniqueOrThrow({ where: { id: result.id } });
  }

  it("creates a domestic customer with audit and idempotent replay", async () => {
    const key = randomUUID();
    const input = {
      context: adminContext,
      companyId: companyAId,
      customerCode: `IDEM-${suffix}`,
      customer: {
        customerType: "DOMESTIC" as const,
        name: "冪等客戶",
        taxId: `10-${suffix}`,
      },
      idempotencyKey: key,
    };
    const first = await createCustomer(db, input);
    const replay = await createCustomer(db, input);
    expect(replay).toEqual({ id: first.id, replayed: true });
    expect(await db.customer.count({ where: { id: first.id } })).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          entityId: first.id,
          operation: "customer.created",
        },
      }),
    ).toBe(1);
  });

  it("enforces normalized domestic tax ID uniqueness", async () => {
    await domestic(`TAX-A-${suffix}`, `22-33-${suffix}`);
    await expect(
      domestic(`TAX-B-${suffix}`, ` 2233${suffix} `),
    ).rejects.toBeInstanceOf(CustomerConstraintError);
  });

  it("enforces foreign identity uniqueness and identity checks", async () => {
    const createForeign = (code: string) =>
      createCustomer(db, {
        context: adminContext,
        companyId: companyAId,
        customerCode: code,
        customer: {
          customerType: "FOREIGN",
          name: `Foreign ${code}`,
          countryCode: "US",
          foreignIdentifier: `F-${suffix}`,
        },
        idempotencyKey: randomUUID(),
      });
    await createForeign(`F-A-${suffix}`);
    await expect(createForeign(`F-B-${suffix}`)).rejects.toBeInstanceOf(
      CustomerConstraintError,
    );

    await expect(
      db.customer.create({
        data: {
          customerType: "FOREIGN",
          name: "Invalid foreign",
          taxId: "12345678",
          normalizedTaxId: "12345678",
          countryCode: "US",
          foreignIdentifier: `INVALID-${suffix}`,
          createdById: adminUserId,
          updatedById: adminUserId,
        },
      }),
    ).rejects.toThrow();
  });

  it("allows one shared customer in two companies with company-scoped codes", async () => {
    const customer = await domestic(`SHARED-${suffix}`);
    await assignCustomerCompany(db, {
      context: adminContext,
      companyId: companyBId,
      customerId: customer.id,
      relation: {
        customerCode: `SHARED-${suffix}`,
        status: "ACTIVE",
      },
      idempotencyKey: randomUUID(),
    });
    expect(
      await db.customerCompany.count({
        where: { customerId: customer.id },
      }),
    ).toBe(2);

    const another = await domestic(`ANOTHER-${suffix}`, undefined, companyBId);
    await expect(
      assignCustomerCompany(db, {
        context: adminContext,
        companyId: companyBId,
        customerId: another.id,
        relation: {
          customerCode: ` shared-${suffix} `,
          status: "ACTIVE",
        },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(CustomerConstraintError);
  });

  it("restricts ORDER_ENTRY reads to active company-authorized customers", async () => {
    const visible = await domestic(`VISIBLE-${suffix}`);
    const hidden = await domestic(`HIDDEN-${suffix}`, undefined, companyBId);
    const result = await listCustomers(db, {
      context: orderContext,
      companyId: companyAId,
      query: { status: "ALL", search: suffix, page: 1, pageSize: 100 },
    });
    expect(result.items.some((customer) => customer.id === visible.id)).toBe(
      true,
    );
    expect(result.items.some((customer) => customer.id === hidden.id)).toBe(
      false,
    );
    await expect(
      getCustomer(db, {
        context: orderContext,
        companyId: companyBId,
        customerId: hidden.id,
      }),
    ).rejects.toBeInstanceOf(CompanyAccessError);
    await expect(
      listCustomers(db, {
        context: orderContext,
        companyId: companyCId,
      }),
    ).rejects.toBeInstanceOf(CompanyAccessError);
  });

  it("does not allow ORDER_ENTRY writes", async () => {
    await expect(
      createCustomer(db, {
        context: orderContext,
        companyId: companyAId,
        customerCode: `DENIED-${suffix}`,
        customer: {
          customerType: "DOMESTIC",
          name: "不得建立",
        },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("requires a contact method and switches the active primary atomically", async () => {
    const customer = await domestic(`CONTACT-${suffix}`);
    await expect(
      saveCustomerContact(db, {
        context: adminContext,
        companyId: companyAId,
        customerId: customer.id,
        contact: { name: "無聯絡方式" },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("電話、手機或電子郵件至少一項必填");
    const first = await saveCustomerContact(db, {
      context: adminContext,
      companyId: companyAId,
      customerId: customer.id,
      contact: {
        name: "第一聯絡人",
        phone: "02-11111111",
        isPrimary: true,
      },
      idempotencyKey: randomUUID(),
    });
    const second = await saveCustomerContact(db, {
      context: adminContext,
      companyId: companyAId,
      customerId: customer.id,
      contact: {
        name: "第二聯絡人",
        mobile: "0911222333",
        isPrimary: true,
      },
      idempotencyKey: randomUUID(),
    });
    const contacts = await db.customerContact.findMany({
      where: { customerId: customer.id },
      orderBy: { name: "asc" },
    });
    expect(contacts.find((contact) => contact.id === first.id)?.isPrimary).toBe(
      false,
    );
    expect(contacts.find((contact) => contact.id === second.id)?.isPrimary).toBe(
      true,
    );
    expect(
      await db.auditLog.count({
        where: {
          entityId: first.id,
          operation: "customer_contact.primary_unset",
        },
      }),
    ).toBe(1);
  });

  it("has database protection for contact methods and active primary uniqueness", async () => {
    const customer = await domestic(`CONTACT-DB-${suffix}`);
    await expect(
      db.customerContact.create({
        data: {
          customerId: customer.id,
          name: "無聯絡方式",
          createdById: adminUserId,
          updatedById: adminUserId,
        },
      }),
    ).rejects.toThrow();
    await db.customerContact.create({
      data: {
        customerId: customer.id,
        name: "主要一",
        phone: "1",
        isPrimary: true,
        createdById: adminUserId,
        updatedById: adminUserId,
      },
    });
    await expect(
      db.customerContact.create({
        data: {
          customerId: customer.id,
          name: "主要二",
          phone: "2",
          isPrimary: true,
          createdById: adminUserId,
          updatedById: adminUserId,
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces location code uniqueness and switches the default atomically", async () => {
    const customer = await domestic(`LOC-${suffix}`);
    const first = await saveDeliveryLocation(db, {
      context: adminContext,
      companyId: companyAId,
      customerId: customer.id,
      location: {
        code: "A01",
        name: "地點一",
        recipientName: "收件一",
        phone: "02-1",
        city: "臺北市",
        addressLine: "測試路1號",
        isDefault: true,
      },
      idempotencyKey: randomUUID(),
    });
    const second = await saveDeliveryLocation(db, {
      context: adminContext,
      companyId: companyAId,
      customerId: customer.id,
      location: {
        code: "A02",
        name: "地點二",
        recipientName: "收件二",
        phone: "02-2",
        city: "臺北市",
        addressLine: "測試路2號",
        isDefault: true,
      },
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await db.deliveryLocation.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).isDefault,
    ).toBe(false);
    expect(
      (
        await db.deliveryLocation.findUniqueOrThrow({
          where: { id: second.id },
        })
      ).isDefault,
    ).toBe(true);
    await expect(
      saveDeliveryLocation(db, {
        context: adminContext,
        companyId: companyAId,
        customerId: customer.id,
        location: {
          code: "A01",
          name: "重複地點",
          recipientName: "收件",
          phone: "02-3",
          addressLine: "測試路3號",
        },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(CustomerConstraintError);
  });

  it("hides a deactivated customer from default usable lists", async () => {
    const customer = await domestic(`INACTIVE-${suffix}`);
    await updateCustomer(db, {
      context: adminContext,
      companyId: companyAId,
      customerId: customer.id,
      customer: {
        customerType: "DOMESTIC",
        name: customer.name,
        taxId: customer.taxId,
        status: "INACTIVE",
      },
      idempotencyKey: randomUUID(),
    });
    const result = await listCustomers(db, {
      context: orderContext,
      companyId: companyAId,
      query: { search: `INACTIVE-${suffix}` },
    });
    expect(result.items).toHaveLength(0);
  });

  it("rolls back customer and audit when audit persistence fails", async () => {
    const invalidContext = {
      ...adminContext,
      session: { sessionId: randomUUID() },
    };
    const code = `ROLLBACK-${suffix}`;
    await expect(
      createCustomer(db, {
        context: invalidContext,
        companyId: companyAId,
        customerCode: code,
        customer: {
          customerType: "DOMESTIC",
          name: "不得保留",
        },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
    expect(
      await db.customerCompany.count({
        where: { normalizedCustomerCode: code },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          operation: "customer.created",
          afterJson: { path: ["name"], equals: "不得保留" },
        },
      }),
    ).toBe(0);
  });

  it("installs all P2.2 constraints and indexes in the catalog", async () => {
    const names = await db.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name FROM pg_constraint
      WHERE conname IN (
        'customers_identity_by_type_check',
        'customer_contacts_method_required_check'
      )
      UNION ALL
      SELECT indexname AS name FROM pg_indexes
      WHERE indexname IN (
        'customer_companies_customer_company_key',
        'delivery_locations_customer_code_key',
        'customers_normalized_tax_id_active_value_key',
        'customer_contacts_one_active_primary_key',
        'delivery_locations_one_active_default_key',
        'delivery_locations_id_customer_key'
      )
    `;
    expect(new Set(names.map((entry) => entry.name))).toEqual(
      new Set([
        "customers_identity_by_type_check",
        "customer_contacts_method_required_check",
        "customer_companies_customer_company_key",
        "delivery_locations_customer_code_key",
        "customers_normalized_tax_id_active_value_key",
        "customer_contacts_one_active_primary_key",
        "delivery_locations_one_active_default_key",
        "delivery_locations_id_customer_key",
      ]),
    );
  });
});
