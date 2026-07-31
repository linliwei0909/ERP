import { describe, expect, it } from "vitest";
import {
  assertDisposableDatabaseIsClean,
  formatTestDatabaseTarget,
  redactTestDatabaseError,
  validateTestDatabaseEnvironment,
  type QueryClient,
} from "../helpers/test-database-safety";

const safeUrl =
  "postgresql://p1_test:p1_test_only@localhost:55432/erp_p4_2x_closeout_20260731_01?schema=public";

function environment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    DATABASE_URL: safeUrl,
    P1_TEST_DATABASE_URL: safeUrl,
    ...overrides,
  };
}

describe("DB test safety URL contract", () => {
  it("accepts one fresh disposable database for both DB environment variables", () => {
    const target = validateTestDatabaseEnvironment(environment());
    expect(target).toMatchObject({
      host: "localhost",
      port: 55432,
      database: "erp_p4_2x_closeout_20260731_01",
      role: "p1_test",
    });
    expect(formatTestDatabaseTarget(target)).toBe(
      "host=localhost port=55432 database=erp_p4_2x_closeout_20260731_01 role=p1_test",
    );
  });

  it("fails instead of skipping when a required environment variable is absent", () => {
    expect(() =>
      validateTestDatabaseEnvironment(
        environment({ P1_TEST_DATABASE_URL: undefined }),
      ),
    ).toThrow("P1_TEST_DATABASE_URL is required; DB tests may not be skipped");
  });

  it.each([
    "postgresql://erp:secret@localhost:5432/erp",
    "postgresql://p1_test:secret@localhost:55432/erp",
    "postgresql://p1_test:secret@db.example.com:55432/erp_test_20260731_01",
  ])("rejects a production or development target: %s", (unsafeUrl) => {
    expect(() =>
      validateTestDatabaseEnvironment(
        environment({
          DATABASE_URL: unsafeUrl,
          P1_TEST_DATABASE_URL: unsafeUrl,
        }),
      ),
    ).toThrow("DB test safety preflight failed");
  });

  it.each([
    "not-a-url",
    "mysql://p1_test:secret@localhost:55432/erp_test_20260731_01",
    "postgresql://p1_test:secret@localhost:55432/random_test_20260731_01",
    "postgresql://p1_test:secret@localhost:55432/erp_p1_test_a",
    "postgresql://p1_test:secret@localhost:55432/erp_test_20260731_01?schema=tenant",
  ])("rejects an unsafe or unrecognized target: %s", (unsafeUrl) => {
    expect(() =>
      validateTestDatabaseEnvironment(
        environment({
          DATABASE_URL: unsafeUrl,
          P1_TEST_DATABASE_URL: unsafeUrl,
        }),
      ),
    ).toThrow("DB test safety preflight failed");
  });

  it("rejects split runtime and test database targets", () => {
    expect(() =>
      validateTestDatabaseEnvironment(
        environment({
          DATABASE_URL:
            "postgresql://p1_test:secret@localhost:55432/erp_p4_2x_closeout_20260731_02",
        }),
      ),
    ).toThrow("must resolve to the same disposable database target");
  });

  it("redacts passwords and full connection strings from errors", () => {
    const target = validateTestDatabaseEnvironment(environment());
    const message = redactTestDatabaseError(
      new Error(`connection rejected: ${safeUrl} / p1_test_only`),
      target,
    );
    expect(message).not.toContain("p1_test_only");
    expect(message).not.toContain(safeUrl);
    expect(message).toContain("[REDACTED]");
  });
});

describe("DB test safety runtime cleanliness contract", () => {
  it("accepts an empty migrated database", async () => {
    const client: QueryClient = {
      query: async <T extends Record<string, unknown>>(sql: string) => {
        if (sql.startsWith("SELECT tablename")) {
          return { rows: [{ tablename: "users" }] as unknown as T[] };
        }
        return { rows: [{ has_rows: false }] as unknown as T[] };
      },
    };

    await expect(assertDisposableDatabaseIsClean(client)).resolves.toBeUndefined();
  });

  it("rejects populated tables without attempting cleanup", async () => {
    const statements: string[] = [];
    const client: QueryClient = {
      query: async <T extends Record<string, unknown>>(sql: string) => {
        statements.push(sql);
        if (sql.startsWith("SELECT tablename")) {
          return { rows: [{ tablename: "users" }] as unknown as T[] };
        }
        return { rows: [{ has_rows: true }] as unknown as T[] };
      },
    };

    await expect(assertDisposableDatabaseIsClean(client)).rejects.toThrow(
      "populated tables: users. No automatic cleanup was performed",
    );
    expect(statements.join(" ")).not.toMatch(
      /\b(drop|truncate|delete|reset)\b/i,
    );
  });
});
