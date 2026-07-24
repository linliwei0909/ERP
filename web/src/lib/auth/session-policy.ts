import { SESSION_IDLE_HOURS } from "@/lib/auth/constants";

export function sessionIdleExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SESSION_IDLE_HOURS * 60 * 60 * 1000);
}

export function isSessionExpired(idleExpiresAt: Date, now: Date): boolean {
  return idleExpiresAt.getTime() <= now.getTime();
}

export function shouldRefreshSessionActivity(
  lastActivityAt: Date,
  now: Date,
  throttleMinutes: number,
): boolean {
  return (
    now.getTime() - lastActivityAt.getTime() >=
    throttleMinutes * 60 * 1000
  );
}
