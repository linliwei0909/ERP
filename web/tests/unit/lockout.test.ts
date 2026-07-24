import { describe, expect, it } from "vitest";
import {
  isAccountTemporarilyLocked,
  nextLoginFailureState,
  resetLoginFailureState,
} from "../../src/lib/auth/lockout";

describe("login lockout", () => {
  it("locks at the configured threshold for a finite duration", () => {
    const now = new Date("2026-07-24T00:00:00Z");
    const state = nextLoginFailureState({
      currentAttempts: 2,
      threshold: 3,
      lockMinutes: 10,
      now,
    });

    expect(state.failedLoginAttempts).toBe(3);
    expect(state.lockedUntil?.toISOString()).toBe(
      "2026-07-24T00:10:00.000Z",
    );
    expect(isAccountTemporarilyLocked(state.lockedUntil, now)).toBe(true);
    expect(
      isAccountTemporarilyLocked(
        state.lockedUntil,
        new Date("2026-07-24T00:10:00Z"),
      ),
    ).toBe(false);
  });

  it("resets failures after successful authentication", () => {
    expect(resetLoginFailureState()).toEqual({
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  });
});
