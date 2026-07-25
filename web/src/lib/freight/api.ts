import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/authorization";
import { CompanyAccessError } from "@/lib/auth/company-scope";
import { SessionAuthenticationError } from "@/lib/auth/session";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency";
import { errorResponse } from "@/lib/http";
import {
  FreightConstraintError,
  FreightEntityNotFoundError,
  FreightRuleNotFoundError,
  FreightRuleStateError,
} from "@/lib/freight/service";
import {
  freightRuleInputSchema,
  freightRuleUpdateSchema,
} from "@/lib/freight/validation";

export const freightRuleCreateRequestSchema = z.object({
  companyId: z.string().uuid(),
  freightRule: freightRuleInputSchema,
});

export const freightRuleUpdateRequestSchema = z.object({
  companyId: z.string().uuid(),
  freightRule: freightRuleUpdateSchema,
});

export function requireFreightIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 255) {
    throw new Error("寫入操作必須提供有效的 Idempotency-Key");
  }
  return key;
}

export function freightApiError(error: unknown): Response {
  if (error instanceof SessionAuthenticationError) {
    return errorResponse({ code: error.code, message: error.message, status: 401 });
  }
  if (error instanceof AuthorizationError || error instanceof CompanyAccessError) {
    return errorResponse({ code: error.code, message: error.message, status: 403 });
  }
  if (error instanceof FreightRuleNotFoundError) {
    return errorResponse({ code: error.code, message: error.message, status: 404 });
  }
  if (error instanceof FreightEntityNotFoundError) {
    return errorResponse({ code: error.code, message: error.message, status: 404 });
  }
  if (
    error instanceof FreightConstraintError ||
    error instanceof FreightRuleStateError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return errorResponse({ code: error.code, message: error.message, status: 409 });
  }
  if (error instanceof z.ZodError) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "運費規則資料格式不正確",
      status: 400,
      details: error.issues,
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
  return errorResponse({
    code: "INTERNAL_ERROR",
    message: "處理運費規則時發生錯誤",
    status: 500,
  });
}
