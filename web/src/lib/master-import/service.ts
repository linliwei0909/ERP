import { createHash } from "node:crypto";
import {
  Prisma,
  type MigrationIssueSeverity,
  type PrismaClient,
} from "@/generated/prisma/client";
import { systemAuditContext, writeAudit } from "@/lib/audit";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { CompanyAccessError, hasCompanyAccess } from "@/lib/auth/company-scope";
import type { RequestContext } from "@/lib/auth/session";
import { createCustomer, assignCustomerCompany } from "@/lib/customers/service";
import {
  normalizeCode,
  normalizeForeignIdentifier,
  normalizeTaxId,
} from "@/lib/customers/validation";
import { getServerEnv } from "@/lib/env";
import { executeIdempotent } from "@/lib/idempotency";
import { createItem, assignItemCompany } from "@/lib/items/service";
import {
  normalizeBarcode,
  normalizeItemCode,
} from "@/lib/items/validation";
import {
  customerCompanyImportRowSchema,
  customerImportRowSchema,
  importEntityTypeSchema,
  isImplementedImporter,
  itemCompanyImportRowSchema,
  itemImportRowSchema,
  type CustomerCompanyImportRow,
  type CustomerImportRow,
  type ImportEntityType,
  type ItemCompanyImportRow,
  type ItemImportRow,
} from "@/lib/master-import/contracts";
import {
  ImportFileError,
  parseCsv,
  redactImportRow,
  sanitizeImportFileName,
} from "@/lib/master-import/csv";
import { sanitizeText } from "@/lib/sensitive-data";
import { z } from "zod";

const ALLOWED_CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);
const TERMINAL_BATCH_STATUSES = new Set([
  "VALIDATED",
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
]);

type RawRow = Record<string, string>;
type ParsedRow =
  | CustomerImportRow
  | CustomerCompanyImportRow
  | ItemImportRow
  | ItemCompanyImportRow;

type ImportIssue = {
  rowNumber: number | null;
  legacyId: string | null;
  severity: MigrationIssueSeverity;
  issueCode: string;
  message: string;
  sourceDataJson?: Record<string, unknown>;
};

type PreparedRow = {
  rowNumber: number;
  raw: RawRow;
  legacyId: string;
  parsed?: ParsedRow;
  skip: boolean;
  invalid: boolean;
};

export class MasterImportError extends Error {
  readonly code: string = "MASTER_IMPORT_ERROR";
}

export class ImporterNotImplementedError extends MasterImportError {
  readonly code = "IMPORTER_NOT_IMPLEMENTED";
}

function normalizeCompanyCode(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

function rowKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function issue(
  row: PreparedRow,
  issues: ImportIssue[],
  input: Omit<ImportIssue, "rowNumber" | "legacyId" | "sourceDataJson">,
) {
  issues.push({
    ...input,
    rowNumber: row.rowNumber,
    legacyId: row.legacyId || null,
    sourceDataJson: redactImportRow(row.raw),
  });
  if (input.severity === "ERROR") row.invalid = true;
}

function importSchema(entityType: ImportEntityType) {
  switch (entityType) {
    case "customers":
      return customerImportRowSchema;
    case "customer_companies":
      return customerCompanyImportRowSchema;
    case "items":
      return itemImportRowSchema;
    case "item_companies":
      return itemCompanyImportRowSchema;
    default:
      return null;
  }
}

function duplicateBusinessKey(
  entityType: ImportEntityType,
  row: ParsedRow,
): string | null {
  if (entityType === "customers") {
    const value = row as CustomerImportRow;
    if (value.customer_type === "DOMESTIC" && value.tax_id) {
      return `tax:${normalizeTaxId(value.tax_id)}`;
    }
    if (value.customer_type === "FOREIGN") {
      return `foreign:${value.country_code?.toUpperCase()}:${normalizeForeignIdentifier(value.foreign_identifier ?? "")}`;
    }
    return `company-code:${normalizeCompanyCode(value.company_code)}:${normalizeCode(value.customer_code)}`;
  }
  if (entityType === "items") {
    return `code:${normalizeItemCode((row as ItemImportRow).code)}`;
  }
  if (entityType === "customer_companies") {
    const value = row as CustomerCompanyImportRow;
    return `relation:${normalizeCompanyCode(value.company_code)}:${normalizeCode(value.customer_code)}`;
  }
  if (entityType === "item_companies") {
    const value = row as ItemCompanyImportRow;
    return `relation:${normalizeCompanyCode(value.company_code)}:${normalizeItemCode(value.company_item_code)}`;
  }
  return null;
}

export function validateImportUpload(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  if (input.bytes.byteLength === 0) throw new ImportFileError("CSV 不得為空");
  if (input.bytes.byteLength > getServerEnv().IMPORT_MAX_FILE_BYTES) {
    throw new ImportFileError("CSV 超過允許大小");
  }
  if (!ALLOWED_CSV_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    throw new ImportFileError("CSV MIME type 不在允許清單");
  }
  const fileName = sanitizeImportFileName(input.fileName);
  if (!fileName.toLowerCase().endsWith(".csv")) {
    throw new ImportFileError("匯入檔案副檔名必須為 .csv");
  }
  const content = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  return {
    fileName,
    content,
    fileHash: createHash("sha256").update(input.bytes).digest("hex"),
  };
}

async function requireImportAccess(
  db: PrismaClient,
  context: RequestContext,
  companyId: string,
) {
  await requireAdminWithAudit(db, context);
  if (
    !hasCompanyAccess(
      context.authorizedCompanies.map((company) => company.id),
      companyId,
    )
  ) {
    await db.$transaction((tx) =>
      writeAudit(tx, {
        ...systemAuditContext({
          companyId: context.selectedCompany?.id,
          actorUserId: context.actor.userId,
          sessionId: context.session.sessionId,
          requestId: context.requestId,
        }),
        entityType: "company",
        entityId: companyId,
        operation: "auth.company.denied",
        metadata: { requestedCompanyId: companyId, resource: "master_import" },
      }),
    );
    throw new CompanyAccessError();
  }
}

async function batchResult(db: PrismaClient, batchId: string, replayed: boolean) {
  const batch = await db.migrationBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      issues: { orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }] },
      legacyMappings: { orderBy: { createdAt: "asc" } },
      reconciliations: true,
    },
  });
  return { batch, replayed };
}

async function prepareRows(
  db: PrismaClient,
  input: {
    entityType: ImportEntityType;
    sourceSystem: string;
    companyId: string;
    companyCode: string;
    rows: RawRow[];
  },
) {
  const issues: ImportIssue[] = [];
  const prepared: PreparedRow[] = input.rows.map((raw, index) => ({
    rowNumber: index + 2,
    raw,
    legacyId: raw.legacy_id?.trim() ?? "",
    skip: false,
    invalid: false,
  }));
  const schema = importSchema(input.entityType);
  if (!schema) {
    for (const row of prepared) {
      issue(row, issues, {
        severity: "ERROR",
        issueCode: "IMPORTER_NOT_IMPLEMENTED",
        message: `${input.entityType} importer 尚未實作`,
      });
    }
    return { prepared, issues };
  }

  for (const row of prepared) {
    const result = schema.safeParse(row.raw);
    if (!result.success) {
      issue(row, issues, {
        severity: "ERROR",
        issueCode: "ROW_VALIDATION_FAILED",
        message: result.error.issues.map((entry) => entry.message).join("；"),
      });
    } else {
      row.parsed = result.data as ParsedRow;
      if (
        normalizeCompanyCode(
          (result.data as { company_code: string }).company_code,
        ) !== normalizeCompanyCode(input.companyCode)
      ) {
        issue(row, issues, {
          severity: "ERROR",
          issueCode: "COMPANY_SCOPE_MISMATCH",
          message: "CSV company_code 與目前匯入公司不一致",
        });
      }
    }
  }

  const legacyRows = new Map<string, PreparedRow[]>();
  const businessRows = new Map<string, PreparedRow[]>();
  for (const row of prepared) {
    if (!row.legacyId) continue;
    legacyRows.set(row.legacyId, [...(legacyRows.get(row.legacyId) ?? []), row]);
    if (row.parsed) {
      const key = duplicateBusinessKey(input.entityType, row.parsed);
      if (key) businessRows.set(key, [...(businessRows.get(key) ?? []), row]);
    }
  }
  for (const rows of legacyRows.values()) {
    if (rows.length <= 1) continue;
    for (const row of rows) {
      issue(row, issues, {
        severity: "ERROR",
        issueCode: "DUPLICATE_LEGACY_ID",
        message: "同一檔案內 legacy_id 重複",
      });
    }
  }
  for (const rows of businessRows.values()) {
    if (rows.length <= 1) continue;
    for (const row of rows) {
      issue(row, issues, {
        severity: "ERROR",
        issueCode: "DUPLICATE_BUSINESS_KEY",
        message: "同一檔案內正式主檔鍵重複",
      });
    }
  }

  const existingMappings = await db.legacyIdMap.findMany({
    where: {
      sourceSystem: input.sourceSystem,
      entityType: input.entityType,
      legacyId: { in: prepared.map((row) => row.legacyId).filter(Boolean) },
    },
  });
  const mapped = new Set(existingMappings.map((entry) => entry.legacyId));
  for (const row of prepared) {
    if (mapped.has(row.legacyId)) {
      row.skip = true;
      issues.push({
        rowNumber: row.rowNumber,
        legacyId: row.legacyId,
        severity: "WARNING",
        issueCode: "LEGACY_ALREADY_MAPPED",
        message: "legacy_id 已有正式 mapping，本列將安全略過",
        sourceDataJson: redactImportRow(row.raw),
      });
    }
  }

  for (const row of prepared) {
    if (!row.parsed || row.invalid || row.skip) continue;
    if (input.entityType === "customers") {
      const value = row.parsed as CustomerImportRow;
      const duplicate = await db.customer.findFirst({
        where:
          value.customer_type === "DOMESTIC" && value.tax_id
            ? { normalizedTaxId: normalizeTaxId(value.tax_id) }
            : value.customer_type === "FOREIGN"
              ? {
                  countryCode: value.country_code?.toUpperCase(),
                  foreignIdentifier: normalizeForeignIdentifier(
                    value.foreign_identifier ?? "",
                  ),
                }
              : {
                  companyRelations: {
                    some: {
                      companyId: input.companyId,
                      normalizedCustomerCode: normalizeCode(value.customer_code),
                    },
                  },
                },
      });
      if (duplicate) {
        issue(row, issues, {
          severity: "ERROR",
          issueCode: "DB_DUPLICATE",
          message: "正式客戶主檔已存在相同識別或公司代碼",
        });
      }
    } else if (input.entityType === "items") {
      const value = row.parsed as ItemImportRow;
      const duplicate = await db.item.findFirst({
        where: {
          OR: [
            { normalizedCode: normalizeItemCode(value.code) },
            ...(value.barcode
              ? [{ barcode: normalizeBarcode(value.barcode) ?? undefined }]
              : []),
          ],
        },
      });
      if (duplicate) {
        issue(row, issues, {
          severity: "ERROR",
          issueCode: "DB_DUPLICATE",
          message: "正式品項代碼或條碼已存在",
        });
      }
    } else {
      const parentEntity =
        input.entityType === "customer_companies" ? "customers" : "items";
      const parentLegacyId =
        input.entityType === "customer_companies"
          ? (row.parsed as CustomerCompanyImportRow).customer_legacy_id
          : (row.parsed as ItemCompanyImportRow).item_legacy_id;
      const parent = await db.legacyIdMap.findUnique({
        where: {
          sourceSystem_entityType_legacyId: {
            sourceSystem: input.sourceSystem,
            entityType: parentEntity,
            legacyId: parentLegacyId,
          },
        },
      });
      if (!parent) {
        issue(row, issues, {
          severity: "ERROR",
          issueCode: "PARENT_MAPPING_NOT_FOUND",
          message: `找不到 ${parentEntity} legacy mapping`,
        });
      }
    }
  }
  return { prepared, issues };
}

async function importPreparedRow(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    sourceSystem: string;
    entityType: ImportEntityType;
    batchId: string;
    row: PreparedRow;
  },
) {
  const key = rowKey(
    `${input.batchId}:${input.entityType}:${input.row.legacyId}`,
  );
  const saveMapping = (
    tx: Prisma.TransactionClient,
    result: { id: string },
  ) =>
    tx.legacyIdMap.create({
      data: {
        sourceSystem: input.sourceSystem,
        entityType: input.entityType,
        legacyId: input.row.legacyId,
        localId: result.id,
        migrationBatchId: input.batchId,
      },
    }).then(() => undefined);
  if (input.entityType === "customers") {
    const value = input.row.parsed as CustomerImportRow;
    await createCustomer(db, {
      context: input.context,
      companyId: input.companyId,
      customer:
        value.customer_type === "DOMESTIC"
          ? {
              customerType: "DOMESTIC",
              name: value.name,
              taxId: value.tax_id,
            }
          : {
              customerType: "FOREIGN",
              name: value.name,
              countryCode: value.country_code!,
              foreignIdentifier: value.foreign_identifier!,
            },
      customerCode: value.customer_code,
      idempotencyKey: key,
      afterWrite: saveMapping,
    });
  } else if (input.entityType === "items") {
    const value = input.row.parsed as ItemImportRow;
    await createItem(db, {
      context: input.context,
      companyId: input.companyId,
      item: {
        code: value.code,
        name: value.name,
        description: value.description,
        specification: value.specification,
        baseUnit: value.base_unit,
        barcode: value.barcode,
        itemType: value.item_type,
        salesEnabled: value.sales_enabled,
        purchaseEnabled: value.purchase_enabled,
        inventoryEnabled: value.inventory_enabled,
        productionEnabled: value.production_enabled,
      },
      companyRelation: {
        companyItemCode: value.company_item_code,
        salesEnabled: value.sales_enabled,
        status: "ACTIVE",
      },
      idempotencyKey: key,
      afterWrite: saveMapping,
    });
  } else {
    const parentEntity =
      input.entityType === "customer_companies" ? "customers" : "items";
    const parentLegacyId =
      input.entityType === "customer_companies"
        ? (input.row.parsed as CustomerCompanyImportRow).customer_legacy_id
        : (input.row.parsed as ItemCompanyImportRow).item_legacy_id;
    const parent = await db.legacyIdMap.findUniqueOrThrow({
      where: {
        sourceSystem_entityType_legacyId: {
          sourceSystem: input.sourceSystem,
          entityType: parentEntity,
          legacyId: parentLegacyId,
        },
      },
    });
    if (input.entityType === "customer_companies") {
      const value = input.row.parsed as CustomerCompanyImportRow;
      await assignCustomerCompany(db, {
        context: input.context,
        companyId: input.companyId,
        customerId: parent.localId,
        relation: {
          customerCode: value.customer_code,
          status: value.status,
        },
        idempotencyKey: key,
        afterWrite: saveMapping,
      });
    } else {
      const value = input.row.parsed as ItemCompanyImportRow;
      await assignItemCompany(db, {
        context: input.context,
        companyId: input.companyId,
        itemId: parent.localId,
        relation: {
          companyItemCode: value.company_item_code,
          salesEnabled: value.sales_enabled,
          status: value.status,
        },
        idempotencyKey: key,
        afterWrite: saveMapping,
      });
    }
  }
}

export async function runMasterImport(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    sourceSystem: string;
    entityType: string;
    dryRun: boolean;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
    idempotencyKey: string;
  },
) {
  await requireImportAccess(db, input.context, input.companyId);
  const entityType = importEntityTypeSchema.parse(input.entityType);
  const sourceSystem = z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((value) => value.normalize("NFKC").toUpperCase())
    .parse(input.sourceSystem);
  const file = validateImportUpload(input);
  const company = await db.company.findUniqueOrThrow({
    where: { id: input.companyId },
  });
  const rows = parseCsv(file.content, entityType);
  if (!input.dryRun && !isImplementedImporter(entityType)) {
    throw new ImporterNotImplementedError(
      `${entityType} 目前僅提供 CSV 契約與 dry-run，尚未開放正式匯入`,
    );
  }
  const existing = await db.migrationBatch.findUnique({
    where: {
      companyId_sourceSystem_entityType_sourceFileHash_dryRun: {
        companyId: input.companyId,
        sourceSystem,
        entityType,
        sourceFileHash: file.fileHash,
        dryRun: input.dryRun,
      },
    },
  });
  if (existing && TERMINAL_BATCH_STATUSES.has(existing.status)) {
    return batchResult(db, existing.id, true);
  }

  const now = new Date();
  const created = await executeIdempotent(
    db,
    {
      companyId: input.companyId,
      userId: input.context.actor.userId,
      operation: `master_import.${input.dryRun ? "dry_run" : "execute"}`,
      key: input.idempotencyKey,
      payload: {
        sourceSystem,
        entityType,
        fileHash: file.fileHash,
        dryRun: input.dryRun,
      },
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      now,
    },
    async (tx) => {
      const batch =
        existing ??
        (await tx.migrationBatch.create({
          data: {
            companyId: input.companyId,
            sourceSystem,
            entityType,
            sourceFileName: file.fileName,
            sourceFileHash: file.fileHash,
            status: "VALIDATING",
            dryRun: input.dryRun,
            initiatedById: input.context.actor.userId,
            correlationId: input.context.requestId,
          },
        }));
      await writeAudit(tx, {
        ...systemAuditContext({
          companyId: input.companyId,
          actorUserId: input.context.actor.userId,
          sessionId: input.context.session.sessionId,
          requestId: input.context.requestId,
        }),
        entityType: "migration_batch",
        entityId: batch.id,
        operation: "migration_batch.created",
        metadata: {
          sourceSystem,
          importedEntityType: entityType,
          dryRun: input.dryRun,
          sourceFileHash: file.fileHash,
        },
      });
      return {
        value: { id: batch.id },
        responseStatus: 201,
        responseMetadata: { id: batch.id },
        resultReference: batch.id,
      };
    },
  );
  const batchId =
    created.replayed ? created.resultReference : created.value.id;
  if (!batchId) throw new MasterImportError("匯入批次缺少識別碼");
  if (created.replayed) {
    const replay = await db.migrationBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    if (TERMINAL_BATCH_STATUSES.has(replay.status)) {
      return batchResult(db, batchId, true);
    }
  }

  const preparedResult = await prepareRows(db, {
    entityType,
    sourceSystem,
    companyId: input.companyId,
    companyCode: company.code,
    rows,
  });
  const issues = preparedResult.issues;
  let importedCount = 0;
  let skippedCount = preparedResult.prepared.filter((row) => row.skip).length;
  let failedCount = preparedResult.prepared.filter((row) => row.invalid).length;
  const validCount =
    preparedResult.prepared.length -
    preparedResult.prepared.filter((row) => row.invalid).length;

  if (input.dryRun) {
    skippedCount = validCount;
  } else {
    await db.migrationBatch.update({
      where: { id: batchId },
      data: { status: "IMPORTING" },
    });
    for (const row of preparedResult.prepared) {
      if (row.invalid || row.skip || !row.parsed) continue;
      try {
        await importPreparedRow(db, {
          context: input.context,
          companyId: input.companyId,
          sourceSystem,
          entityType,
          batchId,
          row,
        });
        importedCount += 1;
      } catch (error) {
        row.invalid = true;
        failedCount += 1;
        issue(row, issues, {
          severity: "ERROR",
          issueCode: "IMPORT_FAILED",
          message: sanitizeText(
            error instanceof Error ? error.message : "正式主檔寫入失敗",
          ),
        });
      }
    }
  }

  const accountedCount = importedCount + skippedCount + failedCount;
  const reconciliationStatus =
    accountedCount === rows.length ? "MATCHED" : "MISMATCHED";
  const finalStatus = input.dryRun
    ? "VALIDATED"
    : failedCount > 0
      ? "COMPLETED_WITH_ERRORS"
      : "COMPLETED";
  await db.$transaction(async (tx) => {
    if (issues.length > 0) {
      await tx.migrationIssue.createMany({
        data: issues.map((entry) => ({
          migrationBatchId: batchId,
          rowNumber: entry.rowNumber,
          legacyId: entry.legacyId,
          severity: entry.severity,
          issueCode: entry.issueCode,
          message: entry.message,
          sourceDataJson:
            entry.sourceDataJson as Prisma.InputJsonValue | undefined,
        })),
      });
    }
    await tx.migrationReconciliation.create({
      data: {
        migrationBatchId: batchId,
        entityType,
        sourceCount: rows.length,
        importedCount,
        skippedCount,
        failedCount,
        reconciliationStatus,
        detailsJson: {
          dryRun: input.dryRun,
          issueCount: issues.length,
        },
      },
    });
    const batch = await tx.migrationBatch.update({
      where: { id: batchId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        totalCount: rows.length,
        validCount,
        importedCount,
        skippedCount,
        failedCount,
        summaryJson: {
          sourceSystem,
          entityType,
          dryRun: input.dryRun,
          reconciliationStatus,
        },
      },
    });
    await writeAudit(tx, {
      ...systemAuditContext({
        companyId: input.companyId,
        actorUserId: input.context.actor.userId,
        sessionId: input.context.session.sessionId,
        requestId: input.context.requestId,
      }),
      entityType: "migration_batch",
      entityId: batch.id,
      operation: input.dryRun
        ? "migration_batch.validated"
        : "migration_batch.completed",
      metadata: {
        totalCount: rows.length,
        validCount,
        importedCount,
        skippedCount,
        failedCount,
      },
    });
  });
  return batchResult(db, batchId, false);
}

export async function listMigrationBatches(
  db: PrismaClient,
  input: { context: RequestContext; companyId: string },
) {
  await requireImportAccess(db, input.context, input.companyId);
  return db.migrationBatch.findMany({
    where: { companyId: input.companyId },
    include: { reconciliations: true },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
}

export async function getMigrationBatch(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    batchId: string;
  },
) {
  await requireImportAccess(db, input.context, input.companyId);
  const batch = await db.migrationBatch.findFirst({
    where: { id: input.batchId, companyId: input.companyId },
    select: { id: true },
  });
  if (!batch) throw new MasterImportError("找不到可存取的匯入批次");
  return batchResult(db, batch.id, false);
}
