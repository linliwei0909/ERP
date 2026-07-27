import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/authorization";
import { CompanyAccessError } from "@/lib/auth/company-scope";
import { SessionAuthenticationError } from "@/lib/auth/session";
import { REQUEST_ID_HEADER, createRequestId } from "@/lib/correlation";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteAdminVoidNotAllowedError,
  DeliveryNoteAlreadyExistsError,
  DeliveryNoteDownstreamLockedError,
  DeliveryNoteIdempotencyConflictError,
  DeliveryNoteInvariantError,
  DeliveryNoteNotFoundError,
  DeliveryNotePrerequisiteError,
  DeliveryNoteRebuildNotAllowedError,
  DeliveryNoteRebuildRequiredError,
  DeliveryNoteReplacementConflictError,
  DeliveryNoteRevisionMismatchError,
  DeliveryNoteVoidReasonRequiredError,
} from "@/lib/delivery-notes/errors";
import type {
  DeliveryNoteDetailResponseDto,
  DeliveryNoteDetailDto,
  DeliveryNoteListResponseDto,
  DeliveryNoteMutationResponseDto,
  DeliveryNoteSummaryDto,
} from "@/lib/delivery-notes/api-types";
import type {
  CreateDeliveryNoteResult,
  DeliveryNoteDetail,
  DeliveryNoteListResult,
  DeliveryNoteSummary,
} from "@/lib/delivery-notes/types";
import { deliveryNoteListFiltersSchema } from "@/lib/delivery-notes/validation";
import { jsonResponse } from "@/lib/http";
import { IdempotencyInProgressError } from "@/lib/idempotency";
import { SalesOrderStatusTransitionError } from "@/lib/sales-orders/state-machine";

const expectedRevisionNoSchema = z.number().int().min(1);

export const deliveryNoteIdSchema = z.string().uuid();
export const deliveryNoteSalesOrderIdSchema = z.string().uuid();

export const createDeliveryNoteRequestSchema = z
  .object({
    expectedRevisionNo: expectedRevisionNoSchema,
  })
  .strict();

export const rebuildDeliveryNoteRequestSchema = z
  .object({
    expectedRevisionNo: expectedRevisionNoSchema.min(2),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const adminVoidDeliveryNoteRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const deliveryNoteListQuerySchema = deliveryNoteListFiltersSchema;

export class DeliveryNoteIdempotencyKeyError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REQUIRED";

  constructor(message = "寫入操作必須提供有效的 Idempotency-Key") {
    super(message);
  }
}

export function requireDeliveryNoteIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 255) {
    throw new DeliveryNoteIdempotencyKeyError();
  }
  return key;
}

export function deliveryNoteRequestId(request: Request): string {
  return createRequestId(request.headers.get(REQUEST_ID_HEADER));
}

export function mapDeliveryNoteSummary(
  value: DeliveryNoteSummary,
): DeliveryNoteSummaryDto {
  const { customerName, ...summary } = value;
  return {
    ...summary,
    customer: { name: customerName },
  };
}

export function mapDeliveryNoteDetail(
  value: DeliveryNoteDetail,
): DeliveryNoteDetailDto {
  const { customerName, ...detail } = value;
  return {
    ...detail,
    customer: { name: customerName },
    lines: detail.lines.map((line) => ({ ...line })),
    replacedDeliveryNote: detail.replacedDeliveryNote
      ? { ...detail.replacedDeliveryNote }
      : null,
    replacementDeliveryNote: detail.replacementDeliveryNote
      ? { ...detail.replacementDeliveryNote }
      : null,
    voidedBy: detail.voidedBy ? { ...detail.voidedBy } : null,
  };
}

export function deliveryNoteMutationResponse(
  result: CreateDeliveryNoteResult,
  correlationId: string,
  status: number,
): Response {
  const body: DeliveryNoteMutationResponseDto = {
    deliveryNote: mapDeliveryNoteDetail(result.deliveryNote),
    replayed: result.replayed,
    correlationId,
  };
  return deliveryNoteJsonResponse(body, correlationId, status);
}

export function deliveryNoteDetailResponse(
  deliveryNote: DeliveryNoteDetail,
  correlationId: string,
): Response {
  const body: DeliveryNoteDetailResponseDto = {
    deliveryNote: mapDeliveryNoteDetail(deliveryNote),
    correlationId,
  };
  return deliveryNoteJsonResponse(body, correlationId, 200);
}

export function deliveryNoteListResponse(
  result: DeliveryNoteListResult,
  correlationId: string,
): Response {
  const body: DeliveryNoteListResponseDto = {
    items: result.deliveryNotes.map(mapDeliveryNoteSummary),
    ...result.pagination,
    correlationId,
  };
  return deliveryNoteJsonResponse(body, correlationId, 200);
}

export function deliveryNoteJsonResponse(
  body: unknown,
  correlationId: string,
  status = 200,
): Response {
  return jsonResponse(body, {
    status,
    headers: { [REQUEST_ID_HEADER]: correlationId },
  });
}

function mappedError(error: unknown): {
  code: string;
  message: string;
  status: number;
  details?: unknown;
} {
  if (error instanceof SessionAuthenticationError) {
    return { code: error.code, message: error.message, status: 401 };
  }
  if (
    error instanceof AuthorizationError ||
    error instanceof CompanyAccessError ||
    error instanceof DeliveryNoteAccessDeniedError
  ) {
    return { code: error.code, message: error.message, status: 403 };
  }
  if (error instanceof DeliveryNoteNotFoundError) {
    return { code: error.code, message: error.message, status: 404 };
  }
  if (error instanceof z.ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "銷貨單資料格式不正確",
      status: 400,
      details: error.issues,
    };
  }
  if (error instanceof SyntaxError) {
    return {
      code: "INVALID_JSON",
      message: "請求內容不是有效的 JSON",
      status: 400,
    };
  }
  if (
    error instanceof DeliveryNoteIdempotencyKeyError ||
    error instanceof DeliveryNoteVoidReasonRequiredError
  ) {
    return { code: error.code, message: error.message, status: 400 };
  }
  if (
    error instanceof DeliveryNoteAlreadyExistsError ||
    error instanceof DeliveryNoteRevisionMismatchError ||
    error instanceof DeliveryNoteRebuildRequiredError ||
    error instanceof DeliveryNoteRebuildNotAllowedError ||
    error instanceof DeliveryNoteReplacementConflictError ||
    error instanceof DeliveryNoteAdminVoidNotAllowedError ||
    error instanceof DeliveryNoteIdempotencyConflictError ||
    error instanceof DeliveryNoteDownstreamLockedError ||
    error instanceof IdempotencyInProgressError ||
    error instanceof SalesOrderStatusTransitionError
  ) {
    return { code: error.code, message: error.message, status: 409 };
  }
  if (
    error instanceof DeliveryNotePrerequisiteError ||
    error instanceof DeliveryNoteInvariantError
  ) {
    return { code: error.code, message: error.message, status: 422 };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "處理銷貨單時發生錯誤",
    status: 500,
  };
}

export function deliveryNoteApiError(
  error: unknown,
  correlationId: string,
): Response {
  const mapped = mappedError(error);
  return deliveryNoteJsonResponse(
    {
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details === undefined
          ? {}
          : { details: mapped.details }),
      },
      correlationId,
    },
    correlationId,
    mapped.status,
  );
}
