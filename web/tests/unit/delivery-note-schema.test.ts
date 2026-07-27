import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const schema = readFileSync(schemaPath, "utf8");

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
    expect(schema).toContain(
      'quantity             Decimal  @db.Decimal(18, 4)',
    );
    expect(schema).toContain(
      'unitPrice            Decimal  @map("unit_price") @db.Decimal(18, 5)',
    );
    expect(schema).toContain(
      'lineAmount           Decimal  @map("line_amount") @db.Decimal(18, 0)',
    );
    expect(schema).not.toContain("orderSnapshot");
    expect(schema).not.toContain("currentDeliveryNoteId");
  });

  it("does not introduce P3.2 service, API, or UI files", () => {
    const forbiddenPaths = [
      "src/lib/delivery-note-service.ts",
      "src/app/api/delivery-notes",
      "src/app/delivery-notes",
    ];

    for (const forbiddenPath of forbiddenPaths) {
      expect(existsSync(resolve(process.cwd(), forbiddenPath))).toBe(false);
    }
  });
});
