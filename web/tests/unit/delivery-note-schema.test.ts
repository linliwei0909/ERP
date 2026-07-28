import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const schema = readFileSync(schemaPath, "utf8");
const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/0011_p3_delivery_note_print_storage/migration.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const contractMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/0012_p3_delivery_note_print_version_contract/migration.sql",
);
const contractMigration = readFileSync(contractMigrationPath, "utf8");

describe("P3.2a delivery-note schema contract", () => {
  it("defines only the approved delivery-note enum values", () => {
    expect(schema).toContain(`enum DeliveryNoteStatus {
  ACTIVE
  SHIPPED
  RECEIVABLE_CREATED
  VOIDED`);
    expect(schema).toContain(`enum DeliveryNoteVoidSource {
  ADMIN_DIRECT
  ORDER_REVISION_REBUILD
  ORDER_VOID`);
    expect(schema).not.toMatch(/enum DeliveryNoteStatus[\s\S]*?\bRETURNED\b/);
  });

  it("uses the approved typed snapshot and numeric storage contract", () => {
    expect(schema).toContain("model DeliveryNote {");
    expect(schema).toContain("model DeliveryNoteLine {");
    expect(schema).toMatch(/quantity\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schema).toMatch(
      /unitPrice\s+Decimal\s+@map\("unit_price"\) @db\.Decimal\(18, 5\)/,
    );
    expect(schema).toMatch(
      /lineAmount\s+Decimal\s+@map\("line_amount"\) @db\.Decimal\(18, 0\)/,
    );
    expect(schema).not.toContain("orderSnapshot");
    expect(schema).not.toContain("currentDeliveryNoteId");
  });

  it("keeps the approved service path and P3.2d2 UI boundaries", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "src/lib/delivery-note-service.ts"),
      ),
    ).toBe(false);
    const requiredPaths = [
      "src/app/api/delivery-notes",
      "src/app/delivery-notes/page.tsx",
      "src/app/delivery-notes/[id]/page.tsx",
      "src/lib/delivery-notes/client.ts",
    ];

    for (const requiredPath of requiredPaths) {
      expect(existsSync(resolve(process.cwd(), requiredPath))).toBe(true);
    }
  });
});

describe("P3.3b delivery-note print-storage schema contract", () => {
  it("defines the immutable print version and append-only event models", () => {
    expect(schema).toContain("model DeliveryNotePrintVersion {");
    expect(schema).toContain("model DeliveryNotePrintEvent {");
    expect(schema).toContain("enum DeliveryNotePrintEventType {");
    expect(schema).toContain("  FORMAL_PRINT");
    expect(schema).toContain("  REPRINT");
    expect(schema).toContain(
      '@unique(map: "delivery_note_print_versions_delivery_note_key")',
    );
  });

  it("adds only the approved delivery-note summary fields", () => {
    expect(schema).toContain(
      'actualDeliveryDate      DateTime?               @map("actual_delivery_date") @db.Date',
    );
    expect(schema).toContain(
      'firstPrintedAt          DateTime?               @map("first_printed_at") @db.Timestamptz(3)',
    );
    expect(schema).toContain(
      'firstPrintedById        String?                 @map("first_printed_by") @db.Uuid',
    );
    expect(schema).toContain(
      'reprintCount            Int                     @default(0) @map("reprint_count")',
    );
    expect(schema).not.toContain("formalPrintVersionId");
    expect(schema).not.toContain("PrintSetting");
    expect(schema).not.toContain("TemplateMaster");
  });

  it("keeps 0011 transactional, fail-fast, additive, and drift-visible", () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain(
      "P3.3b preflight failed: shipped delivery notes require complete print storage data",
    );
    expect(migration).toContain(
      'WHERE "status" IN (\'SHIPPED\', \'RECEIVABLE_CREATED\')',
    );
    expect(migration).not.toContain("IF NOT EXISTS");
    expect(migration).not.toMatch(/\bUPDATE\s+"delivery_notes"/);
  });

  it("installs fixed append-only protection for both print tables", () => {
    expect(migration).toContain(
      "CREATE FUNCTION \"reject_delivery_note_print_storage_mutation\"()",
    );
    expect(migration).toContain(
      "RAISE EXCEPTION '% is append-only: % is not allowed'",
    );
    expect(migration.match(/ENABLE ALWAYS TRIGGER/g)).toHaveLength(4);
    expect(migration).toContain(
      'CREATE TRIGGER "delivery_note_print_versions_reject_truncate"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "delivery_note_print_events_reject_truncate"',
    );
  });
});

describe("P3.3b2 formal print version contract supplement", () => {
  it("stores the required snapshot and independent print version identities", () => {
    expect(schema).toMatch(
      /snapshotVersion\s+String\s+@map\("snapshot_version"\) @db\.VarChar\(100\)/,
    );
    expect(schema).toMatch(
      /rendererVersion\s+String\s+@map\("renderer_version"\) @db\.VarChar\(100\)/,
    );
    expect(schema).toMatch(
      /fontVersion\s+String\s+@map\("font_version"\) @db\.VarChar\(100\)/,
    );
    expect(schema.match(/snapshotVersion\s+String/g)).toHaveLength(2);
    expect(schema).toMatch(
      /documentVersion\s+Int\s+@default\(1\) @map\("document_version"\)/,
    );
    expect(schema).toMatch(
      /templateVersion\s+String\s+@map\("template_version"\) @db\.VarChar\(100\)/,
    );
    expect(schema).not.toContain("formalPrintVersionId");
  });

  it("backfills only the scalar discriminator and fails on existing print versions", () => {
    expect(contractMigration.trimStart()).toMatch(/^BEGIN;/);
    expect(contractMigration.trimEnd()).toMatch(/COMMIT;$/);
    expect(contractMigration).toContain(
      "SET \"snapshot_version\" = 'delivery-note-snapshot-v1'",
    );
    expect(contractMigration).not.toMatch(
      /UPDATE\s+"delivery_notes"[\s\S]*?(company_snapshot|customer_snapshot|delivery_snapshot|freight_snapshot)/,
    );
    expect(contractMigration).toContain(
      'FROM "delivery_note_print_versions"',
    );
    expect(contractMigration).toContain(
      "contains % existing row(s); renderer, font, and snapshot versions require source verification",
    );
    expect(contractMigration).not.toMatch(/\bDEFAULT\b/i);
    expect(contractMigration.match(/SET NOT NULL/g)).toHaveLength(1);
    expect(contractMigration.match(/VARCHAR\(100\) NOT NULL/g)).toHaveLength(
      3,
    );
  });

  it("keeps the existing uniqueness, company relations, and append-only triggers", () => {
    expect(schema).toContain(
      '@unique(map: "delivery_note_print_versions_delivery_note_key")',
    );
    expect(schema).toContain(
      '@@unique([deliveryNoteId, documentVersion], map: "delivery_note_print_versions_note_document_version_key")',
    );
    expect(schema).not.toMatch(
      /model DeliveryNote \{[\s\S]*?formalPrintVersion[\s\S]*?\n\}/,
    );
    expect(migration).toContain(
      'CREATE TRIGGER "delivery_note_print_versions_reject_update_delete"',
    );
    expect(contractMigration).not.toContain("CREATE TRIGGER");
    expect(contractMigration).not.toContain("DROP TRIGGER");
  });
});
