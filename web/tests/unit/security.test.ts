import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieOptions } from "../../src/lib/auth/cookie";
import { logger } from "../../src/lib/logger";
import { proxy } from "../../src/proxy";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("security boundaries", () => {
  it("uses an HttpOnly, SameSite cookie and Secure in production", () => {
    expect(sessionCookieOptions("production")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("redacts password and token values from logs", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("security test", {
      password: "plain-password-must-not-appear",
      sessionToken: "raw-session-token-must-not-appear",
    });

    const serialized = output.mock.calls.flat().join(" ");
    expect(serialized).not.toContain("plain-password-must-not-appear");
    expect(serialized).not.toContain("raw-session-token-must-not-appear");
    expect(serialized).toContain("[REDACTED]");
  });

  it("redirects a protected page when no cookie is present", () => {
    const response = proxy(new NextRequest("http://localhost/admin/users"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });
});
