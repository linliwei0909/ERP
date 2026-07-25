import { describe, expect, it } from "vitest";
import { retryDelayMs } from "../../src/lib/background-jobs";
import { hashIdempotencyPayload } from "../../src/lib/idempotency";
import {
  sanitizeSensitive,
  sanitizeText,
} from "../../src/lib/sensitive-data";

describe("idempotency payload hashing", () => {
  it("is stable for objects with different key order", () => {
    expect(hashIdempotencyPayload({ b: 2, a: 1 })).toBe(
      hashIdempotencyPayload({ a: 1, b: 2 }),
    );
  });

  it("changes when the payload changes", () => {
    expect(hashIdempotencyPayload({ amount: 1 })).not.toBe(
      hashIdempotencyPayload({ amount: 2 }),
    );
  });
});

describe("operational data redaction", () => {
  it("removes secrets recursively without changing safe context", () => {
    expect(
      sanitizeSensitive({
        actorUserId: "actor-1",
        nested: { password: "plain", sessionToken: "token-value" },
      }),
    ).toEqual({
      actorUserId: "actor-1",
      nested: { password: "[REDACTED]", sessionToken: "[REDACTED]" },
    });
  });

  it("redacts secret-like values embedded in error text", () => {
    expect(sanitizeText("token=abc123 failed")).not.toContain("abc123");
  });
});

describe("background job retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(retryDelayMs(1, 1000, 10000)).toBe(1000);
    expect(retryDelayMs(3, 1000, 10000)).toBe(4000);
    expect(retryDelayMs(10, 1000, 10000)).toBe(10000);
  });
});
