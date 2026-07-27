import { sanitizeSensitive } from "@/lib/sensitive-data";
import {
  IMPORT_HEADERS,
  type ImportEntityType,
} from "@/lib/master-import/contracts";

export class ImportFileError extends Error {
  readonly code = "IMPORT_FILE_INVALID";
}

export function sanitizeImportFileName(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").at(-1) ?? "import.csv";
  const sanitized = leaf
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^\.+/, "")
    .slice(0, 255);
  return sanitized || "import.csv";
}

export function neutralizeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function redactImportRow(
  row: Record<string, string>,
): Record<string, unknown> {
  const piiPattern =
    /tax_id|foreign_identifier|email|phone|mobile|address|recipient/i;
  const neutralized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      piiPattern.test(key) ? "[REDACTED]" : neutralizeFormula(value),
    ]),
  );
  return sanitizeSensitive(neutralized) as Record<string, unknown>;
}

export function parseCsv(
  content: string,
  entityType: ImportEntityType,
): Array<Record<string, string>> {
  if (content.includes("\0")) throw new ImportFileError("CSV 不得包含 NUL 字元");
  const source = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      if (cell.length > 0) throw new ImportFileError("CSV 引號格式不正確");
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new ImportFileError("CSV 引號未關閉");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  while (rows.at(-1)?.every((value) => value === "")) rows.pop();
  if (rows.length === 0) throw new ImportFileError("CSV 沒有 header");
  if (rows.length > 10_001) throw new ImportFileError("CSV 最多允許 10,000 筆");

  const expected = IMPORT_HEADERS[entityType];
  const header = rows[0]!;
  if (
    header.length !== expected.length ||
    header.some((value, index) => value !== expected[index])
  ) {
    throw new ImportFileError(
      `CSV header 必須完全符合 ${expected.join(",")}`,
    );
  }
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new ImportFileError(`第 ${rowIndex + 2} 列欄位數量不正確`);
    }
    return Object.fromEntries(
      header.map((field, index) => [field, values[index] ?? ""]),
    );
  });
}
