import { jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return jsonResponse({
    status: "ok",
    service: "web",
    timestamp: new Date().toISOString(),
  });
}
