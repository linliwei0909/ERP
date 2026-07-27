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
  WORKER_ID: z.string().min(1).max(100).optional(),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  JOB_HEARTBEAT_SECONDS: z.coerce.number().int().min(1).max(300).default(15),
  JOB_STALE_LOCK_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  JOB_RETRY_BASE_SECONDS: z.coerce.number().int().min(1).max(3600).default(5),
  JOB_RETRY_MAX_SECONDS: z.coerce.number().int().min(1).max(86400).default(300),
  WORKER_READY_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(3600)
    .default(60),
  IMPORT_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10 * 1024 * 1024)
    .default(1024 * 1024),
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
