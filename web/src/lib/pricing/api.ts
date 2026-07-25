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
  PriceNotFoundError,
  PricingConstraintError,
  PricingNotFoundError,
} from "@/lib/pricing/service";
import {
  itemPriceInputSchema,
  periodAdjustmentSchema,
  priceAssignmentInputSchema,
  priceListInputSchema,
} from "@/lib/pricing/validation";

export const priceListCreateRequestSchema = z.object({
  companyId: z.string().uuid(),
  priceList: priceListInputSchema,
});
export const priceListUpdateRequestSchema = z.object({
  companyId: z.string().uuid(),
  priceList: priceListInputSchema.extend({
    status: z.enum(["ACTIVE", "INACTIVE"]),
  }),
});
export const itemPriceCreateRequestSchema = z.object({
  companyId: z.string().uuid(),
  price: itemPriceInputSchema,
});
export const periodAdjustmentRequestSchema = z.object({
  companyId: z.string().uuid(),
  adjustment: periodAdjustmentSchema,
});
export const assignmentCreateRequestSchema = z.object({
  companyId: z.string().uuid(),
  assignment: priceAssignmentInputSchema,
});

export function requirePricingIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 255) {
    throw new Error("寫入操作必須提供有效的 Idempotency-Key");
  }
  return key;
}

export function pricingApiError(error: unknown): Response {
  if (error instanceof SessionAuthenticationError) {
    return errorResponse({ code: error.code, message: error.message, status: 401 });
  }
  if (error instanceof AuthorizationError || error instanceof CompanyAccessError) {
    return errorResponse({ code: error.code, message: error.message, status: 403 });
  }
  if (error instanceof PriceNotFoundError) {
    return errorResponse({ code: error.code, message: error.message, status: 404 });
  }
  if (error instanceof PricingNotFoundError) {
    return errorResponse({ code: error.code, message: error.message, status: 404 });
  }
  if (
    error instanceof PricingConstraintError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return errorResponse({ code: error.code, message: error.message, status: 409 });
  }
  if (error instanceof z.ZodError) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "價格資料格式不正確",
      status: 400,
      details: error.issues,
    });
  }
  if (error instanceof SyntaxError) {
    return errorResponse({ code: "INVALID_JSON", message: "請求內容不是有效的 JSON", status: 400 });
  }
  if (error instanceof Error && error.message.includes("Idempotency-Key")) {
    return errorResponse({ code: "IDEMPOTENCY_KEY_REQUIRED", message: error.message, status: 400 });
  }
  return errorResponse({ code: "INTERNAL_ERROR", message: "處理價格資料時發生錯誤", status: 500 });
}
