import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import { REQUEST_ID_HEADER } from "@/lib/correlation";
import {
  masterImportApiError,
  migrationBatchQuerySchema,
  requireImportIdempotencyKey,
} from "@/lib/master-import/api";
import {
  listMigrationBatches,
  MasterImportError,
  runMasterImport,
} from "@/lib/master-import/service";
import { jsonResponse } from "@/lib/http";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    const query = migrationBatchQuerySchema.parse({
      companyId:
        request.nextUrl.searchParams.get("companyId") ??
        context.selectedCompany.id,
    });
    const result = await listMigrationBatches(prisma, {
      context,
      companyId: query.companyId,
    });
    return jsonResponse(result, {
      headers: { [REQUEST_ID_HEADER]: context.requestId },
    });
  } catch (error) {
    return masterImportApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (
      Number.isFinite(contentLength) &&
      contentLength >
        getServerEnv().IMPORT_MAX_FILE_BYTES + 128 * 1024
    ) {
      throw new MasterImportError("匯入請求超過允許大小");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new MasterImportError("必須上傳 CSV 檔案");
    }
    const result = await runMasterImport(prisma, {
      context,
      companyId: String(form.get("companyId") ?? ""),
      sourceSystem: String(form.get("sourceSystem") ?? ""),
      entityType: String(form.get("entityType") ?? ""),
      dryRun: String(form.get("dryRun") ?? "") === "true",
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      idempotencyKey: requireImportIdempotencyKey(request),
    });
    return jsonResponse(result, {
      status: result.replayed ? 200 : 201,
      headers: { [REQUEST_ID_HEADER]: context.requestId },
    });
  } catch (error) {
    return masterImportApiError(error);
  }
}
