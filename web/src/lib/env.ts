import { z } from "zod";

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  AUTH_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  SESSION_ACTIVITY_THROTTLE_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(5),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: Record<string, string | undefined>,
): ServerEnv {
  return serverEnvSchema.parse(input);
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}
