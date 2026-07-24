import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/auth/password";

describe("password hashing", () => {
  it("creates a salted strong hash and verifies the password", async () => {
    const password = "A-strong-test-password-123";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(password);
    expect(second).not.toBe(first);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const encoded = await hashPassword("Correct-password-123");
    await expect(
      verifyPassword("Incorrect-password-123", encoded),
    ).resolves.toBe(false);
  });
});
