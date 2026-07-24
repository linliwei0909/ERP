import { describe, expect, it } from "vitest";
import { parseServerEnv } from "../../src/lib/env";

describe("server environment validation", () => {
  it("accepts the required database URL and applies defaults", () => {
    expect(
      parseServerEnv({
        DATABASE_URL: "postgresql://user:password@localhost:5432/erp",
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://user:password@localhost:5432/erp",
      LOG_LEVEL: "info",
    });
  });

  it("rejects an invalid database URL", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "not-a-url" }),
    ).toThrow();
  });
});
