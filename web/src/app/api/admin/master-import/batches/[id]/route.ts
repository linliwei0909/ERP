import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { REQUEST_ID_HEADER } from "@/lib/correlation";
import {
  masterImportApiError,
  migrationBatchIdSchema,
  migrationBatchQuerySchema,
} from "@/lib/master-import/api";
import { getMigrationBatch } from "@/lib/master-import/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getApiRequestContext(request);
    const query = migrationBatchQuerySchema.parse({
      companyId:
        request.nextUrl.searchParams.get("companyId") ??
        context.selectedCompany.id,
    });
    const batchId = migrationBatchIdSchema.parse((await params).id);
    const result = await getMigrationBatch(prisma, {
      context,
      companyId: query.companyId,
      batchId,
    });
    return jsonResponse(result, {
      headers: { [REQUEST_ID_HEADER]: context.requestId },
    });
  } catch (error) {
    return masterImportApiError(error);
  }
}
