import { describe, expect, it } from "vitest";
import {
  customerImportRowSchema,
  itemImportRowSchema,
} from "../../src/lib/master-import/contracts";
import {
  ImportFileError,
  neutralizeFormula,
  parseCsv,
  redactImportRow,
  sanitizeImportFileName,
} from "../../src/lib/master-import/csv";
import { validateImportUpload } from "../../src/lib/master-import/service";

const customerHeader =
  "legacy_id,company_code,customer_code,customer_type,name,tax_id,country_code,foreign_identifier";

describe("P2.6 master import contracts", () => {
  it("parses quoted CSV and normalizes typed staging values", () => {
    const rows = parseCsv(
      `${customerHeader}\nC1,industrial,c-01,DOMESTIC,\"客戶,一\",12345678,,`,
      "customers",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("客戶,一");
    expect(customerImportRowSchema.parse(rows[0])).toMatchObject({
      legacy_id: "C1",
      customer_type: "DOMESTIC",
      tax_id: "12345678",
    });
  });

  it("rejects malformed headers, rows, quotes and NUL bytes", () => {
    expect(() => parseCsv("wrong\nvalue", "customers")).toThrow(ImportFileError);
    expect(() => parseCsv(`${customerHeader}\nC1`, "customers")).toThrow(
      ImportFileError,
    );
    expect(() =>
      parseCsv(`${customerHeader}\n\"unterminated`, "customers"),
    ).toThrow(ImportFileError);
    expect(() => parseCsv(`${customerHeader}\n\0`, "customers")).toThrow(
      ImportFileError,
    );
  });

  it("rejects invalid business values before service execution", () => {
    expect(
      customerImportRowSchema.safeParse({
        legacy_id: "C1",
        company_code: "INDUSTRIAL",
        customer_code: "C1",
        customer_type: "FOREIGN",
        name: "境外客戶",
        tax_id: "",
        country_code: "",
        foreign_identifier: "",
      }).success,
    ).toBe(false);
    expect(
      itemImportRowSchema.safeParse({
        legacy_id: "I1",
        company_code: "INDUSTRIAL",
        company_item_code: "I1",
        code: "I1",
        name: "品項",
        description: "",
        specification: "",
        base_unit: "PCS",
        barcode: "",
        item_type: "PRODUCT",
        sales_enabled: "yes",
        purchase_enabled: "false",
        inventory_enabled: "false",
        production_enabled: "false",
      }).success,
    ).toBe(false);
  });

  it("neutralizes spreadsheet formulas and redacts sensitive issue fields", () => {
    expect(neutralizeFormula("=2+2")).toBe("'=2+2");
    expect(redactImportRow({ name: "=cmd()", tax_id: "12345678" })).toEqual({
      name: "'=cmd()",
      tax_id: "[REDACTED]",
    });
  });

  it("sanitizes filenames and enforces extension, MIME and UTF-8", () => {
    process.env.DATABASE_URL ??=
      "postgresql://user:password@localhost:5432/erp";
    expect(sanitizeImportFileName("../../危險 檔案.csv")).toBe(
      "危險_檔案.csv",
    );
    const valid = validateImportUpload({
      fileName: "customers.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode(customerHeader),
    });
    expect(valid.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(() =>
      validateImportUpload({
        fileName: "customers.exe",
        mimeType: "text/csv",
        bytes: new Uint8Array([1]),
      }),
    ).toThrow(ImportFileError);
    expect(() =>
      validateImportUpload({
        fileName: "customers.csv",
        mimeType: "application/octet-stream",
        bytes: new Uint8Array([1]),
      }),
    ).toThrow(ImportFileError);
    expect(() =>
      validateImportUpload({
        fileName: "customers.csv",
        mimeType: "text/csv",
        bytes: new Uint8Array([0xff]),
      }),
    ).toThrow();
    expect(() =>
      validateImportUpload({
        fileName: "customers.csv",
        mimeType: "text/csv",
        bytes: new Uint8Array(1_048_577),
      }),
    ).toThrow(ImportFileError);
  });
});
