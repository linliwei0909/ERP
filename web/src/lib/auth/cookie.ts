import { SESSION_COOKIE_NAME, SESSION_IDLE_HOURS } from "@/lib/auth/constants";

export function sessionCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_IDLE_HOURS * 60 * 60,
    priority: "high" as const,
  };
}
