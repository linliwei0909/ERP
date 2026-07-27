import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/authorization";
import { CompanyAccessError } from "@/lib/auth/company-scope";
import { SessionAuthenticationError } from "@/lib/auth/session";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency";
import { errorResponse } from "@/lib/http";
import { ImportFileError } from "@/lib/master-import/csv";
import {
  ImporterNotImplementedError,
  MasterImportError,
} from "@/lib/master-import/service";

export const migrationBatchQuerySchema = z.object({
  companyId: z.string().uuid(),
});

export const migrationBatchIdSchema = z.string().uuid();

export function requireImportIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 255) {
    throw new MasterImportError(
      "寫入操作必須提供有效的 Idempotency-Key",
    );
  }
  return key;
}

export function masterImportApiError(error: unknown): Response {
  if (error instanceof SessionAuthenticationError) {
    return errorResponse({ code: error.code, message: error.message, status: 401 });
  }
  if (error instanceof AuthorizationError || error instanceof CompanyAccessError) {
    return errorResponse({ code: error.code, message: error.message, status: 403 });
  }
  if (error instanceof ImporterNotImplementedError) {
    return errorResponse({ code: error.code, message: error.message, status: 409 });
  }
  if (
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return errorResponse({ code: error.code, message: error.message, status: 409 });
  }
  if (error instanceof ImportFileError || error instanceof MasterImportError) {
    return errorResponse({ code: error.code, message: error.message, status: 400 });
  }
  if (error instanceof z.ZodError) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "匯入參數格式不正確",
      status: 400,
      details: error.issues,
    });
  }
  return errorResponse({
    code: "INTERNAL_ERROR",
    message: "處理主檔匯入時發生錯誤",
    status: 500,
  });
}
