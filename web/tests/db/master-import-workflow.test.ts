import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { AuthorizationError } from "../../src/lib/auth/authorization";
import { CompanyAccessError } from "../../src/lib/auth/company-scope";
import type { RequestContext } from "../../src/lib/auth/session";
import { runMasterImport } from "../../src/lib/master-import/service";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;
const customerHeader =
  "legacy_id,company_code,customer_code,customer_type,name,tax_id,country_code,foreign_identifier";
const customerCompanyHeader =
  "legacy_id,customer_legacy_id,company_code,customer_code,status";
const itemHeader =
  "legacy_id,company_code,company_item_code,code,name,description,specification,base_unit,barcode,item_type,sales_enabled,purchase_enabled,inventory_enabled,production_enabled";

describeDatabase("P2.6 master import workflows", () => {
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
        data: { code: `MA-${suffix}`, name: `匯入公司 A ${suffix}` },
      }),
      db.company.create({
        data: { code: `MB-${suffix}`, name: `匯入公司 B ${suffix}` },
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
          username: `import-admin-${suffix}`,
          normalizedUsername: `import-admin-${suffix}`,
          passwordHash: "test",
          defaultCompanyId: companyA.id,
        },
      }),
      db.user.create({
        data: {
          username: `import-order-${suffix}`,
          normalizedUsername: `import-order-${suffix}`,
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
        data: { userId: order.id, companyId: companyA.id },
      }),
    ]);
    const [adminSession, orderSession] = await Promise.all([
      db.userSession.create({
        data: {
          userId: admin.id,
          tokenHash: `import-admin-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
      db.userSession.create({
        data: {
          userId: order.id,
          tokenHash: `import-order-${randomUUID()}`,
          selectedCompanyId: companyA.id,
        },
      }),
    ]);
    adminContext = {
      actor: { userId: admin.id, username: admin.username },
      session: { sessionId: adminSession.id },
      requestId: `import-admin-${suffix}`,
      roleCodes: ["ADMIN"],
      authorizedCompanies: [companyA],
      selectedCompany: companyA,
    };
    orderContext = {
      actor: { userId: order.id, username: order.username },
      session: { sessionId: orderSession.id },
      requestId: `import-order-${suffix}`,
      roleCodes: ["ORDER_ENTRY"],
      authorizedCompanies: [companyA],
      selectedCompany: companyA,
    };
  });

  afterAll(async () => db.$disconnect());

  function execute(input: {
    context?: RequestContext;
    companyId?: string;
    entityType?: string;
    dryRun?: boolean;
    csv: string;
    sourceSystem?: string;
    fileName?: string;
    key?: string;
  }) {
    return runMasterImport(db, {
      context: input.context ?? adminContext,
      companyId: input.companyId ?? companyA.id,
      sourceSystem: input.sourceSystem ?? `RAGIC-${suffix.toUpperCase()}`,
      entityType: input.entityType ?? "customers",
      dryRun: input.dryRun ?? true,
      fileName: input.fileName ?? "customers.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode(input.csv),
      idempotencyKey: input.key ?? randomUUID(),
    });
  }

  it("dry-run records validation and reconciliation without changing masters", async () => {
    const before = await db.customerCompany.count({
      where: { companyId: companyA.id, normalizedCustomerCode: `DRY-${suffix}`.toUpperCase() },
    });
    const csv = `${customerHeader}\nDRY-${suffix},${companyA.code},DRY-${suffix},DOMESTIC,Dry Run 客戶,,,`;
    const result = await execute({ csv });
    expect(result.batch).toMatchObject({
      status: "VALIDATED",
      dryRun: true,
      totalCount: 1,
      validCount: 1,
      importedCount: 0,
      skippedCount: 1,
      failedCount: 0,
    });
    expect(result.batch.reconciliations[0]?.reconciliationStatus).toBe(
      "MATCHED",
    );
    expect(
      await db.customerCompany.count({
        where: { companyId: companyA.id, normalizedCustomerCode: `DRY-${suffix}`.toUpperCase() },
      }),
    ).toBe(before);
  });

  it("reports invalid rows, file duplicates and missing parent mappings", async () => {
    const duplicateLegacy = `DUP-${suffix}`;
    const duplicateCsv = `${customerHeader}\n${duplicateLegacy},${companyA.code},A-${suffix},FOREIGN,=cmd(),,,\n${duplicateLegacy},${companyA.code},A-${suffix},DOMESTIC,重複客戶,,,`;
    const duplicate = await execute({
      csv: duplicateCsv,
      fileName: "duplicate.csv",
    });
    expect(duplicate.batch.failedCount).toBe(2);
    expect(
      duplicate.batch.issues.map((entry) => entry.issueCode),
    ).toContain("DUPLICATE_LEGACY_ID");
    expect(
      duplicate.batch.issues.map((entry) => entry.issueCode),
    ).toContain("ROW_VALIDATION_FAILED");
    expect(
      (
        duplicate.batch.issues.find(
          (entry) => entry.issueCode === "ROW_VALIDATION_FAILED",
        )?.sourceDataJson as { name?: string }
      ).name,
    ).toBe("'=cmd()");

    const child = await execute({
      entityType: "customer_companies",
      csv: `${customerCompanyHeader}\nREL-${suffix},MISSING-${suffix},${companyA.code},REL-${suffix},ACTIVE`,
      fileName: "customer_companies.csv",
    });
    expect(child.batch.issues[0]?.issueCode).toBe("PARENT_MAPPING_NOT_FOUND");
  });

  it("executes through formal services with audit, mapping and safe rerun", async () => {
    const legacyId = `EXEC-${suffix}`;
    const csv = `${customerHeader}\n${legacyId},${companyA.code},EXEC-${suffix},DOMESTIC,正式匯入客戶,,,`;
    const first = await execute({ csv, dryRun: false });
    expect(first.batch).toMatchObject({
      status: "COMPLETED",
      importedCount: 1,
      failedCount: 0,
    });
    expect(first.batch.legacyMappings).toHaveLength(1);
    const localId = first.batch.legacyMappings[0]!.localId;
    await expect(
      db.customer.findUniqueOrThrow({ where: { id: localId } }),
    ).resolves.toBeDefined();
    await expect(
      db.auditLog.count({
        where: {
          entityId: { in: [localId, first.batch.id] },
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(2);

    const rerun = await execute({
      csv,
      dryRun: false,
      key: randomUUID(),
    });
    expect(rerun.replayed).toBe(true);
    expect(rerun.batch.id).toBe(first.batch.id);
    expect(
      await db.legacyIdMap.count({
        where: {
          sourceSystem: `RAGIC-${suffix.toUpperCase()}`,
          entityType: "customers",
          legacyId,
        },
      }),
    ).toBe(1);
  });

  it("detects DB duplicates and imports items with atomic mappings", async () => {
    const duplicate = `${customerHeader}\nDB-${suffix},${companyA.code},EXEC-${suffix},DOMESTIC,重複代碼客戶,,,`;
    const dry = await execute({ csv: duplicate, fileName: "db-duplicate.csv" });
    expect(dry.batch.issues.some((entry) => entry.issueCode === "DB_DUPLICATE")).toBe(
      true,
    );

    const itemLegacyId = `ITEM-${suffix}`;
    const itemCsv = `${itemHeader}\n${itemLegacyId},${companyA.code},IC-${suffix},I-${suffix},匯入品項,,,PCS,,PRODUCT,true,false,false,false`;
    const item = await execute({
      entityType: "items",
      csv: itemCsv,
      dryRun: false,
      fileName: "items.csv",
    });
    expect(item.batch.importedCount).toBe(1);
    expect(item.batch.legacyMappings).toHaveLength(1);
    expect(
      await db.itemCompany.count({
        where: {
          itemId: item.batch.legacyMappings[0]!.localId,
          companyId: companyA.id,
        },
      }),
    ).toBe(1);
  });

  it("rolls back formal master, relation and audit when mapping fails", async () => {
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION reject_p2_import_mapping()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.legacy_id LIKE 'ROLLBACK-%' THEN
          RAISE EXCEPTION 'forced mapping failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS reject_p2_import_mapping_trigger ON legacy_id_map;
      CREATE TRIGGER reject_p2_import_mapping_trigger
      BEFORE INSERT ON legacy_id_map
      FOR EACH ROW EXECUTE FUNCTION reject_p2_import_mapping();
    `);
    const legacyId = `ROLLBACK-${suffix}`;
    const code = `RB-${suffix}`;
    try {
      const result = await execute({
        csv: `${customerHeader}\n${legacyId},${companyA.code},${code},DOMESTIC,Rollback 客戶,,,`,
        dryRun: false,
        fileName: "rollback.csv",
      });
      expect(result.batch).toMatchObject({
        status: "COMPLETED_WITH_ERRORS",
        importedCount: 0,
        failedCount: 1,
      });
      expect(
        await db.customerCompany.count({
          where: {
            companyId: companyA.id,
            normalizedCustomerCode: code.toUpperCase(),
          },
        }),
      ).toBe(0);
      expect(
        await db.auditLog.count({
          where: {
            operation: { in: ["customer.created", "customer_company.created"] },
            afterJson: { path: ["name"], equals: "Rollback 客戶" },
          },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS reject_p2_import_mapping_trigger ON legacy_id_map;
        DROP FUNCTION IF EXISTS reject_p2_import_mapping();
      `);
    }
  });

  it("rejects ORDER_ENTRY and an unscoped company", async () => {
    const csv = `${customerHeader}\nDENY-${suffix},${companyA.code},DENY-${suffix},DOMESTIC,拒絕客戶,,,`;
    await expect(execute({ context: orderContext, csv })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(
      execute({ companyId: companyB.id, csv }),
    ).rejects.toBeInstanceOf(CompanyAccessError);
  });
});
