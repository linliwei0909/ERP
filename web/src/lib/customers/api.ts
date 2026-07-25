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
  CustomerChildNotFoundError,
  CustomerConstraintError,
  CustomerNotFoundError,
} from "@/lib/customers/service";
import {
  customerCompanyInputSchema,
  customerContactInputSchema,
  customerInputSchema,
  deliveryLocationInputSchema,
} from "@/lib/customers/validation";

export const customerCreateRequestSchema = z.object({
  companyId: z.string().uuid(),
  customer: customerInputSchema,
  customerCode: z.string(),
});

export const customerUpdateRequestSchema = z.object({
  companyId: z.string().uuid(),
  customer: z.intersection(
    customerInputSchema,
    z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }),
  ),
});

export const customerCompanyRequestSchema = z.object({
  companyId: z.string().uuid(),
  relation: customerCompanyInputSchema,
});

export const customerContactRequestSchema = z.object({
  companyId: z.string().uuid(),
  value: customerContactInputSchema,
});

export const deliveryLocationRequestSchema = z.object({
  companyId: z.string().uuid(),
  value: deliveryLocationInputSchema,
});

export function requireCustomerIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 255) {
    throw new Error("寫入操作必須提供有效的 Idempotency-Key");
  }
  return key;
}

export function customerApiError(error: unknown): Response {
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
    error instanceof CustomerConstraintError ||
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
    error instanceof CustomerNotFoundError ||
    error instanceof CustomerChildNotFoundError
  ) {
    return errorResponse({
      code: error.code,
      message: error.message,
      status: 404,
    });
  }
  if (error instanceof z.ZodError) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "客戶資料格式不正確",
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
    message: "處理客戶資料時發生錯誤",
    status: 500,
  });
}
