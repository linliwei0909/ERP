import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/authorization";
import { CompanyAccessError } from "@/lib/auth/company-scope";
import { SessionAuthenticationError } from "@/lib/auth/session";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency";
import { errorResponse } from "@/lib/http";
import { UnregisteredCompanySettingError } from "@/lib/company-settings/registry";
import {
  CompanySettingMissingError,
  CompanySettingVersionConflictError,
  CompanySettingVersionImmutableError,
  CompanySettingVersionNotFoundError,
  FutureEffectiveDateRequiredError,
} from "@/lib/company-settings/service";

export const companySettingWriteSchema = z.object({
  companyId: z.string().uuid(),
  settingKey: z.string().min(1).max(100),
  settingValue: z.unknown(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const companySettingCancelSchema = z.object({
  companyId: z.string().uuid(),
  settingKey: z.string().min(1).max(100),
});

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 255) {
    throw new Error("寫入操作必須提供有效的 Idempotency-Key");
  }
  return key;
}

export function companySettingApiError(error: unknown): Response {
  if (error instanceof SessionAuthenticationError) {
    return errorResponse({
      code: error.code,
      message: error.message,
      status: 401,
    });
  }
  if (
    error instanceof AuthorizationError ||
    error instanceof CompanyAccessError
  ) {
    return errorResponse({
      code: error.code,
      message: error.message,
      status: 403,
    });
  }
  if (
    error instanceof CompanySettingVersionConflictError ||
    error instanceof CompanySettingVersionImmutableError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return errorResponse({
      code: error.code,
      message: error.message,
      status: 409,
    });
  }
  if (
    error instanceof CompanySettingVersionNotFoundError ||
    error instanceof CompanySettingMissingError
  ) {
    return errorResponse({
      code: error.code,
      message: error.message,
      status: 404,
    });
  }
  if (
    error instanceof FutureEffectiveDateRequiredError ||
    error instanceof UnregisteredCompanySettingError ||
    error instanceof z.ZodError
  ) {
    return errorResponse({
      code:
        "code" in error && typeof error.code === "string"
          ? error.code
          : "VALIDATION_ERROR",
      message:
        error instanceof z.ZodError
          ? "公司設定資料格式不正確"
          : error.message,
      status: 400,
      details:
        error instanceof z.ZodError ? error.issues : undefined,
    });
  }
  if (error instanceof SyntaxError) {
    return errorResponse({
      code: "INVALID_JSON",
      message: "請求內容不是有效的 JSON",
      status: 400,
    });
  }
  if (error instanceof Error && error.message.includes("Idempotency-Key")) {
    return errorResponse({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: error.message,
      status: 400,
    });
  }
  if (
    error instanceof Error &&
    (error.message.includes("日期") ||
      error.message.includes("年份") ||
      error.message.includes("月份"))
  ) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: error.message,
      status: 400,
    });
  }

  return errorResponse({
    code: "INTERNAL_ERROR",
    message: "處理公司設定時發生錯誤",
    status: 500,
  });
}
