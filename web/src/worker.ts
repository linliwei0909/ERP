import { hostname } from "node:os";
import {
  claimNextJob,
  completeJob,
  failJob,
  heartbeatJobLock,
  updateWorkerHeartbeat,
} from "@/lib/background-jobs";
import { getServerEnv } from "@/lib/env";
import { resolveJobHandler } from "@/lib/job-handlers";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const env = getServerEnv();
const workerId = env.WORKER_ID ?? `${hostname()}-${process.pid}`;
const startedAt = new Date();
let stopping = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(): Promise<boolean> {
  const now = new Date();
  const job = await claimNextJob(prisma, {
    workerId,
    staleBefore: new Date(now.getTime() - env.JOB_STALE_LOCK_SECONDS * 1000),
    now,
  });
  if (!job) {
    return false;
  }

  logger.info("Background job claimed", {
    event: "job.claimed",
    jobId: job.id,
    jobType: job.jobType,
    companyId: job.companyId,
    correlationId: job.correlationId,
    workerId,
    attemptCount: job.attemptCount,
  });

  const heartbeat = setInterval(() => {
    void heartbeatJobLock(prisma, job.id, workerId).catch((error) => {
      logger.error("Job lock heartbeat failed", {
        event: "job.heartbeat.failed",
        jobId: job.id,
        correlationId: job.correlationId,
        error,
      });
    });
  }, env.JOB_HEARTBEAT_SECONDS * 1000);

  try {
    await resolveJobHandler(job.jobType)(job);
    await completeJob(prisma, job.id, workerId);
    logger.info("Background job completed", {
      event: "job.completed",
      jobId: job.id,
      correlationId: job.correlationId,
    });
  } catch (error) {
    const status = await failJob(prisma, {
      jobId: job.id,
      workerId,
      error,
      baseDelayMs: env.JOB_RETRY_BASE_SECONDS * 1000,
      maxDelayMs: env.JOB_RETRY_MAX_SECONDS * 1000,
    });
    logger.error("Background job failed", {
      event: status === "DEAD_LETTER" ? "job.dead_lettered" : "job.failed",
      jobId: job.id,
      correlationId: job.correlationId,
      status,
      error,
    });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info("Worker stopping", { event: "worker.stopping", workerId, signal });
  await updateWorkerHeartbeat(prisma, {
    workerId,
    status: "STOPPING",
    startedAt,
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function main(): Promise<void> {
  await updateWorkerHeartbeat(prisma, {
    workerId,
    status: "RUNNING",
    startedAt,
    metadata: { service: "worker" },
  });
  logger.info("Worker started", { event: "worker.started", workerId });

  while (!stopping) {
    await updateWorkerHeartbeat(prisma, {
      workerId,
      status: "RUNNING",
      startedAt,
    });
    const processed = await processJob();
    if (!processed) {
      await wait(env.JOB_POLL_INTERVAL_MS);
    }
  }

  await updateWorkerHeartbeat(prisma, {
    workerId,
    status: "STOPPED",
    startedAt,
  });
  await prisma.$disconnect();
  logger.info("Worker stopped", { event: "worker.stopped", workerId });
}

main().catch(async (error) => {
  logger.error("Worker terminated unexpectedly", {
    event: "worker.crashed",
    workerId,
    error,
  });
  await prisma.$disconnect();
  process.exitCode = 1;
});
