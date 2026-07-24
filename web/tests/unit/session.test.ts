import { describe, expect, it } from "vitest";
import {
  isSessionExpired,
  sessionIdleExpiresAt,
  shouldRefreshSessionActivity,
} from "../../src/lib/auth/session-policy";
import {
  createSessionToken,
  hashSessionToken,
} from "../../src/lib/auth/session-token";

describe("session security", () => {
  it("hashes the opaque token without storing the original", () => {
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    expect(token).toHaveLength(43);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });

  it("uses an eight-hour idle window", () => {
    const now = new Date("2026-07-24T00:00:00.000Z");
    const expiry = sessionIdleExpiresAt(now);

    expect(expiry.toISOString()).toBe("2026-07-24T08:00:00.000Z");
    expect(isSessionExpired(expiry, new Date("2026-07-24T07:59:59Z"))).toBe(
      false,
    );
    expect(isSessionExpired(expiry, expiry)).toBe(true);
  });

  it("throttles session activity writes", () => {
    const lastActivity = new Date("2026-07-24T00:00:00Z");

    expect(
      shouldRefreshSessionActivity(
        lastActivity,
        new Date("2026-07-24T00:04:59Z"),
        5,
      ),
    ).toBe(false);
    expect(
      shouldRefreshSessionActivity(
        lastActivity,
        new Date("2026-07-24T00:05:00Z"),
        5,
      ),
    ).toBe(true);
  });
});
