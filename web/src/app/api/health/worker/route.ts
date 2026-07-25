import { getServerEnv } from "@/lib/env";
import { errorResponse, jsonResponse } from "@/lib/http";
import { assertExpectedMigrations } from "@/lib/migration-health";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await assertExpectedMigrations(prisma);
    const cutoff = new Date(
      Date.now() - getServerEnv().WORKER_READY_MAX_AGE_SECONDS * 1000,
    );
    const heartbeat = await prisma.workerHeartbeat.findFirst({
      where: {
        status: "RUNNING",
        lastHeartbeatAt: { gte: cutoff },
      },
      orderBy: { lastHeartbeatAt: "desc" },
      select: {
        workerId: true,
        lastHeartbeatAt: true,
      },
    });
    if (!heartbeat) {
      throw new Error("No current worker heartbeat");
    }
    return jsonResponse({
      status: "ready",
      service: "worker",
      workerId: heartbeat.workerId,
      lastHeartbeatAt: heartbeat.lastHeartbeatAt.toISOString(),
    });
  } catch {
    return errorResponse({
      code: "WORKER_NOT_READY",
      message: "背景工作服務尚未就緒",
      status: 503,
    });
  }
}
