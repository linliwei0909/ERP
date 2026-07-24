import { errorResponse, jsonResponse } from "@/lib/http";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return jsonResponse({
      status: "ready",
      service: "web",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Readiness check failed", { error });

    return errorResponse({
      code: "SERVICE_NOT_READY",
      message: "服務尚未就緒",
      status: 503,
    });
  }
}
