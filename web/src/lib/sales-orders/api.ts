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
  SalesOrderAlreadyVoidedError,
  SalesOrderConstraintError,
  SalesOrderNotEditableError,
  SalesOrderNotFoundError,
  SalesOrderPrerequisiteError,
  SalesOrderRevisionRequiredError,
} from "@/lib/sales-orders/service";
import { SalesOrderStatusTransitionError } from "@/lib/sales-orders/state-machine";
import {
  salesOrderDraftInputSchema,
  salesOrderLineInputSchema,
  voidSalesOrderSchema,
} from "@/lib/sales-orders/validation";

export const createSalesOrderRequestSchema = z.object({
  draft: salesOrderDraftInputSchema,
});

export const updateSalesOrderRequestSchema = createSalesOrderRequestSchema;

export const previewPricingRequestSchema = z.object({
  customerId: z.string().uuid(),
  orderDate: z.string(),
  lines: z.array(salesOrderLineInputSchema).min(1).max(200),
});

export const previewFreightRequestSchema = z.object({
  customerId: z.string().uuid(),
  deliveryLocationId: z.string().uuid(),
  orderDate: z.string(),
  quantities: z.array(z.union([z.string(), z.number()])).min(1).max(200),
});

export { voidSalesOrderSchema };

export function requireSalesOrderIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 255) {
    throw new Error("寫入操作必須提供有效的 Idempotency-Key");
  }
  return key;
}
export function salesOrderApiError(error: unknown): Response {
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
  if (error instanceof SalesOrderNotFoundError) {
    return errorResponse({
      code: error.code,
      message: error.message,
      status: 404,
    });
  }
  if (
    error instanceof SalesOrderConstraintError ||
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
    error instanceof SalesOrderPrerequisiteError ||
    error instanceof SalesOrderNotEditableError ||
    error instanceof SalesOrderRevisionRequiredError ||
    error instanceof SalesOrderAlreadyVoidedError ||
    error instanceof SalesOrderStatusTransitionError
  ) {
    return errorResponse({
      code: error.code,
      message: error.message,
      status: 422,
    });
  }
  if (error instanceof z.ZodError) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "銷售訂單資料格式不正確",
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
    message: "處理銷售訂單時發生錯誤",
    status: 500,
  });
}
