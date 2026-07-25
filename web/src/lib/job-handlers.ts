import type { BackgroundJob } from "@/generated/prisma/client";

export type JobHandler = (job: BackgroundJob) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  "test.echo": async () => {
    // P1-only validation handler. It intentionally has no business side effect.
  },
};

export function resolveJobHandler(jobType: string): JobHandler {
  const handler = handlers[jobType];
  if (!handler) {
    throw new Error(`Unsupported job type: ${jobType}`);
  }
  return handler;
}
