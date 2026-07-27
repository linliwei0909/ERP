import type { DeliveryNoteMutationResponseDto } from "@/lib/delivery-notes/api-types";

type Fetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

type DeliveryNoteErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
  correlationId?: string;
};

export class DeliveryNoteClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly correlationId?: string,
  ) {
    super(message);
  }
}

function idempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

async function deliveryNoteMutation(
  url: string,
  body: unknown,
  fetcher: Fetcher = fetch,
): Promise<DeliveryNoteMutationResponseDto> {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey(),
    },
    body: JSON.stringify(body),
  });
  const value = (await response.json().catch(() => ({}))) as
    | DeliveryNoteMutationResponseDto
    | DeliveryNoteErrorBody;
  if (!response.ok) {
    const error = value as DeliveryNoteErrorBody;
    throw new DeliveryNoteClientError(
      error.error?.message ?? "銷貨單操作失敗，請稍後再試",
      response.status,
      error.error?.code ?? "UNKNOWN_ERROR",
      error.correlationId,
    );
  }
  return value as DeliveryNoteMutationResponseDto;
}

export function createDeliveryNote(
  salesOrderId: string,
  expectedRevisionNo: number,
  fetcher?: Fetcher,
): Promise<DeliveryNoteMutationResponseDto> {
  return deliveryNoteMutation(
    `/api/sales-orders/${salesOrderId}/delivery-note`,
    { expectedRevisionNo },
    fetcher,
  );
}

export function rebuildDeliveryNote(
  salesOrderId: string,
  expectedRevisionNo: number,
  reason: string,
  fetcher?: Fetcher,
): Promise<DeliveryNoteMutationResponseDto> {
  const normalized = reason.trim();
  if (!normalized) {
    throw new DeliveryNoteClientError(
      "重建理由必填",
      400,
      "VALIDATION_ERROR",
    );
  }
  return deliveryNoteMutation(
    `/api/sales-orders/${salesOrderId}/delivery-note/rebuild`,
    { expectedRevisionNo, reason: normalized },
    fetcher,
  );
}

export function voidDeliveryNote(
  deliveryNoteId: string,
  reason: string,
  fetcher?: Fetcher,
): Promise<DeliveryNoteMutationResponseDto> {
  const normalized = reason.trim();
  if (!normalized) {
    throw new DeliveryNoteClientError(
      "作廢理由必填",
      400,
      "VALIDATION_ERROR",
    );
  }
  return deliveryNoteMutation(
    `/api/delivery-notes/${deliveryNoteId}/void`,
    { reason: normalized },
    fetcher,
  );
}

export function singleFlight<Arguments extends unknown[], Result>(
  operation: (...args: Arguments) => Promise<Result>,
): (...args: Arguments) => Promise<Result> {
  let pending: Promise<Result> | null = null;
  return (...args) => {
    if (pending) return pending;
    pending = operation(...args).finally(() => {
      pending = null;
    });
    return pending;
  };
}
