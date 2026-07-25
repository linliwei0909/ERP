import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import {
  bootstrapInitialCompanySettings,
  cancelFutureSettingVersion,
  CompanySettingVersionConflictError,
  CompanySettingVersionImmutableError,
  createFutureSettingVersion,
  getBillingCutoffDay,
  listCompanySettingHistory,
  parseDateOnly,
  updateFutureSettingVersion,
} from "../../src/lib/company-settings/service";
import { COMPANY_SETTING_KEYS } from "../../src/lib/company-settings/registry";
import { AuthorizationError } from "../../src/lib/auth/authorization";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;
const fixedNow = new Date("2026-07-25T12:00:00.000Z");

describeDatabase("P2.1 company setting workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyAId: string;
  let companyBId: string;
  let adminUserId: string;
  let adminContext: RequestContext;
  let orderContext: RequestContext;

  beforeAll(async () => {
    const [companyA, companyB] = await Promise.all([
      db.company.create({
        data: { code: `CSA-${suffix}`, name: `公司設定 A ${suffix}` },
      }),
      db.company.create({
        data: { code: `CSB-${suffix}`, name: `公司設定 B ${suffix}` },
      }),
    ]);
    companyAId = companyA.id;
    companyBId = companyB.id;
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
          username: `company-admin-${suffix}`,
          normalizedUsername: `company-admin-${suffix}`,
          passwordHash: "integration-test-not-a-real-password-hash",
          defaultCompanyId: companyAId,
        },
      }),
      db.user.create({
        data: {
          username: `company-order-${suffix}`,
          normalizedUsername: `company-order-${suffix}`,
          passwordHash: "integration-test-not-a-real-password-hash",
          defaultCompanyId: companyAId,
        },
      }),
    ]);
    adminUserId = admin.id;
    await Promise.all([
      db.userRole.create({
        data: { userId: admin.id, roleId: adminRole.id },
      }),
      db.userRole.create({
        data: { userId: order.id, roleId: orderRole.id },
      }),
      db.userCompanyScope.create({
        data: { userId: admin.id, companyId: companyAId },
      }),
      db.userCompanyScope.create({
        data: { userId: admin.id, companyId: companyBId },
      }),
      db.userCompanyScope.create({
        data: { userId: order.id, companyId: companyAId },
      }),
    ]);
    const [adminSession, orderSession] = await Promise.all([
      db.userSession.create({
        data: {
          userId: admin.id,
          tokenHash: `company-setting-admin-${randomUUID()}`,
          selectedCompanyId: companyAId,
        },
      }),
      db.userSession.create({
        data: {
          userId: order.id,
          tokenHash: `company-setting-order-${randomUUID()}`,
          selectedCompanyId: companyAId,
        },
      }),
    ]);

    adminContext = {
      actor: { userId: admin.id, username: admin.username },
      session: { sessionId: adminSession.id },
      requestId: `company-setting-admin-${suffix}`,
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
      requestId: `company-setting-order-${suffix}`,
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

  function futureInput<T extends Record<string, unknown>>(
    overrides: T,
  ): {
    context: RequestContext;
    companyId: string;
    settingKey: typeof COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY;
    settingValue: number;
    effectiveFrom: Date;
    idempotencyKey: string;
    now: Date;
  } & T;
  function futureInput(): {
    context: RequestContext;
    companyId: string;
    settingKey: typeof COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY;
    settingValue: number;
    effectiveFrom: Date;
    idempotencyKey: string;
    now: Date;
  };
  function futureInput(overrides: Record<string, unknown> = {}) {
    return {
      context: adminContext,
      companyId: companyAId,
      settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
      settingValue: 25,
      effectiveFrom: parseDateOnly("2030-01-01"),
      idempotencyKey: randomUUID(),
      now: fixedNow,
      ...overrides,
    };
  }

  it("allows ADMIN to create a future version with audit", async () => {
    const result = await createFutureSettingVersion(
      db,
      futureInput({ effectiveFrom: parseDateOnly("2030-01-02") }),
    );
    expect(result.replayed).toBe(false);
    expect(
      await db.auditLog.count({
        where: {
          entityId: result.id,
          operation: "company_setting.future_created",
        },
      }),
    ).toBe(1);
  });

  it("rejects ORDER_ENTRY writes", async () => {
    await expect(
      createFutureSettingVersion(
        db,
        futureInput({
          context: orderContext,
          effectiveFrom: parseDateOnly("2030-01-03"),
        }),
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects access to a company outside the actor scope", async () => {
    const restrictedContext = {
      ...adminContext,
      authorizedCompanies: [adminContext.authorizedCompanies[0]],
    };
    await expect(
      listCompanySettingHistory(
        db,
        restrictedContext,
        companyBId,
        COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
        fixedNow,
      ),
    ).rejects.toBeInstanceOf(CompanyAccessError);
  });

  it("rejects duplicate company, key and effective date", async () => {
    const effectiveFrom = parseDateOnly("2030-01-04");
    await createFutureSettingVersion(db, futureInput({ effectiveFrom }));
    await expect(
      createFutureSettingVersion(
        db,
        futureInput({
          effectiveFrom,
          idempotencyKey: randomUUID(),
        }),
      ),
    ).rejects.toBeInstanceOf(CompanySettingVersionConflictError);
  });

  it("does not modify or cancel effective versions", async () => {
    const setting = await db.companySetting.create({
      data: {
        companyId: companyAId,
        settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
        settingValue: 25,
        effectiveFrom: parseDateOnly("2026-01-01"),
      },
    });
    await expect(
      updateFutureSettingVersion(
        db,
        futureInput({
          id: setting.id,
          effectiveFrom: parseDateOnly("2030-01-05"),
        }),
      ),
    ).rejects.toBeInstanceOf(CompanySettingVersionImmutableError);
    await expect(
      cancelFutureSettingVersion(db, {
        context: adminContext,
        companyId: companyAId,
        id: setting.id,
        settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
        idempotencyKey: randomUUID(),
        now: fixedNow,
      }),
    ).rejects.toBeInstanceOf(CompanySettingVersionImmutableError);
  });

  it("updates and cancels future versions with audit history", async () => {
    const created = await createFutureSettingVersion(
      db,
      futureInput({ effectiveFrom: parseDateOnly("2030-01-06") }),
    );
    await updateFutureSettingVersion(
      db,
      futureInput({
        id: created.id,
        settingValue: 31,
        effectiveFrom: parseDateOnly("2030-02-01"),
      }),
    );
    const updated = await db.companySetting.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(updated.settingValue).toBe(31);

    await cancelFutureSettingVersion(db, {
      context: adminContext,
      companyId: companyAId,
      id: created.id,
      settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
      idempotencyKey: randomUUID(),
      now: fixedNow,
    });
    expect(
      await db.companySetting.findUnique({ where: { id: created.id } }),
    ).toBeNull();
    expect(
      await db.auditLog.count({
        where: {
          entityId: created.id,
          operation: {
            in: [
              "company_setting.future_created",
              "company_setting.future_updated",
              "company_setting.future_cancelled",
            ],
          },
        },
      }),
    ).toBe(3);
    const history = await listCompanySettingHistory(
      db,
      adminContext,
      companyAId,
      COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
      fixedNow,
    );
    expect(
      history.some(
        (entry) => entry.id === created.id && entry.state === "CANCELLED",
      ),
    ).toBe(true);
  });

  it("rolls back setting and audit together when audit persistence fails", async () => {
    const invalidSessionContext = {
      ...adminContext,
      session: { sessionId: randomUUID() },
    };
    const effectiveFrom = parseDateOnly("2030-01-07");
    await expect(
      createFutureSettingVersion(
        db,
        futureInput({
          context: invalidSessionContext,
          effectiveFrom,
        }),
      ),
    ).rejects.toThrow();
    expect(
      await db.companySetting.count({
        where: {
          companyId: companyAId,
          settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
          effectiveFrom,
        },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          companyId: companyAId,
          operation: "company_setting.future_created",
          afterJson: { path: ["effectiveFrom"], equals: "2030-01-07" },
        },
      }),
    ).toBe(0);
  });

  it("replays an idempotent request without creating another version", async () => {
    const input = futureInput({
      effectiveFrom: parseDateOnly("2030-01-08"),
      idempotencyKey: randomUUID(),
    });
    const first = await createFutureSettingVersion(db, input);
    const repeated = await createFutureSettingVersion(db, input);
    expect(first.replayed).toBe(false);
    expect(repeated).toEqual({ id: first.id, replayed: true });
    expect(
      await db.companySetting.count({
        where: {
          companyId: companyAId,
          settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
          effectiveFrom: input.effectiveFrom,
        },
      }),
    ).toBe(1);
  });

  it("isolates company histories", async () => {
    const result = await createFutureSettingVersion(
      db,
      futureInput({
        companyId: companyBId,
        effectiveFrom: parseDateOnly("2030-01-09"),
      }),
    );
    const companyAHistory = await listCompanySettingHistory(
      db,
      adminContext,
      companyAId,
      COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
      fixedNow,
    );
    expect(companyAHistory.some((entry) => entry.id === result.id)).toBe(false);
  });

  it("selects the latest version effective on a requested date", async () => {
    await db.companySetting.createMany({
      data: [
        {
          companyId: companyBId,
          settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
          settingValue: 20,
          effectiveFrom: parseDateOnly("2026-01-01"),
        },
        {
          companyId: companyBId,
          settingKey: COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
          settingValue: 25,
          effectiveFrom: parseDateOnly("2026-06-01"),
        },
      ],
    });
    await expect(
      getBillingCutoffDay(
        db,
        companyBId,
        parseDateOnly("2026-05-31"),
      ),
    ).resolves.toBe(20);
    await expect(
      getBillingCutoffDay(
        db,
        companyBId,
        parseDateOnly("2026-06-01"),
      ),
    ).resolves.toBe(25);
  });

  it("bootstraps both formal initial settings idempotently", async () => {
    const [industrial, biotech] = await Promise.all([
      db.company.upsert({
        where: { code: "INDUSTRIAL" },
        update: { status: "ACTIVE" },
        create: { code: "INDUSTRIAL", name: "實業" },
      }),
      db.company.upsert({
        where: { code: "BIOTECH" },
        update: { status: "ACTIVE" },
        create: { code: "BIOTECH", name: "生技" },
      }),
    ]);
    await db.userCompanyScope.createMany({
      data: [
        { userId: adminUserId, companyId: industrial.id },
        { userId: adminUserId, companyId: biotech.id },
      ],
      skipDuplicates: true,
    });
    const bootstrapYear =
      2100 + (Number.parseInt(suffix.slice(0, 4), 16) % 7000);
    const bootstrapMonth =
      1 + (Number.parseInt(suffix.slice(4, 6), 16) % 12);
    const bootstrapDay =
      1 + (Number.parseInt(suffix.slice(6, 8), 16) % 28);
    const effectiveFrom = parseDateOnly(
      `${bootstrapYear}-${String(bootstrapMonth).padStart(2, "0")}-${String(
        bootstrapDay,
      ).padStart(2, "0")}`,
    );
    const first = await bootstrapInitialCompanySettings(db, {
      adminUsername: `company-admin-${suffix}`,
      effectiveFrom,
      requestId: `bootstrap-company-settings-${suffix}`,
    });
    const repeated = await bootstrapInitialCompanySettings(db, {
      adminUsername: `company-admin-${suffix}`,
      effectiveFrom,
      requestId: `bootstrap-company-settings-${suffix}`,
    });

    expect(first.every((result) => result.created)).toBe(true);
    expect(repeated.every((result) => !result.created)).toBe(true);
    await expect(
      getBillingCutoffDay(db, industrial.id, effectiveFrom),
    ).resolves.toBe(25);
    await expect(
      getBillingCutoffDay(db, biotech.id, effectiveFrom),
    ).resolves.toBe(20);
    expect(
      await db.auditLog.count({
        where: {
          actorUserId: adminUserId,
          operation: "bootstrap.company_setting.created",
          requestId: `bootstrap-company-settings-${suffix}`,
        },
      }),
    ).toBe(2);
  });
});
