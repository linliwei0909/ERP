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
      AUTH_MAX_FAILED_ATTEMPTS: 5,
      AUTH_LOCK_MINUTES: 15,
      SESSION_ACTIVITY_THROTTLE_MINUTES: 5,
      JOB_POLL_INTERVAL_MS: 1000,
      JOB_HEARTBEAT_SECONDS: 15,
      JOB_STALE_LOCK_SECONDS: 60,
      JOB_RETRY_BASE_SECONDS: 5,
      JOB_RETRY_MAX_SECONDS: 300,
      WORKER_READY_MAX_AGE_SECONDS: 60,
      IMPORT_MAX_FILE_BYTES: 1_048_576,
    });
  });

  it("rejects an invalid database URL", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "not-a-url" }),
    ).toThrow();
  });
});
