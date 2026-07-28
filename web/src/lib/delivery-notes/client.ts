import type { DeliveryNoteMutationResponseDto } from "@/lib/delivery-notes/api-types";
import type { DeliveryNotePrintResponseDto } from "@/lib/delivery-notes/print-api";

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

export function createDeliveryNoteIdempotencyKey(): string {
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
      "idempotency-key": createDeliveryNoteIdempotencyKey(),
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

async function deliveryNotePrintMutation(
  deliveryNoteId: string,
  operation: "formal-print" | "reprint",
  operationKey: string,
  fetcher: Fetcher = fetch,
): Promise<DeliveryNotePrintResponseDto> {
  const response = await fetcher(
    `/api/delivery-notes/${deliveryNoteId}/${operation}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": operationKey,
      },
      body: "{}",
    },
  );
  const value = (await response.json().catch(() => ({}))) as
    | DeliveryNotePrintResponseDto
    | DeliveryNoteErrorBody;
  if (!response.ok) {
    const error = value as DeliveryNoteErrorBody;
    throw new DeliveryNoteClientError(
      error.error?.message ?? "銷貨單列印操作失敗，請稍後再試",
      response.status,
      error.error?.code ?? "UNKNOWN_ERROR",
      error.correlationId,
    );
  }
  return value as DeliveryNotePrintResponseDto;
}

export function formalPrintDeliveryNote(
  deliveryNoteId: string,
  operationKey: string,
  fetcher?: Fetcher,
): Promise<DeliveryNotePrintResponseDto> {
  return deliveryNotePrintMutation(
    deliveryNoteId,
    "formal-print",
    operationKey,
    fetcher,
  );
}

export function reprintDeliveryNote(
  deliveryNoteId: string,
  operationKey: string,
  fetcher?: Fetcher,
): Promise<DeliveryNotePrintResponseDto> {
  return deliveryNotePrintMutation(
    deliveryNoteId,
    "reprint",
    operationKey,
    fetcher,
  );
}

export function createPrintMutationSession(
  operation: "formal-print" | "reprint",
  deliveryNoteId: string,
  fetcher?: Fetcher,
) {
  const operationKey = createDeliveryNoteIdempotencyKey();
  return {
    operationKey,
    execute: () =>
      operation === "formal-print"
        ? formalPrintDeliveryNote(deliveryNoteId, operationKey, fetcher)
        : reprintDeliveryNote(deliveryNoteId, operationKey, fetcher),
  };
}

export function filenameFromContentDisposition(
  value: string | null,
): string | null {
  if (!value || /[\r\n]/.test(value)) return null;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  const quoted = value.match(/filename="([^"]*)"/i)?.[1];
  return quoted?.trim() || null;
}

type DownloadBrowser = {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAnchor: () => {
    href: string;
    download: string;
    click: () => void;
    remove: () => void;
  };
};

function browserDownloadEnvironment(): DownloadBrowser {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new DeliveryNoteClientError(
      "目前環境無法下載 PDF",
      0,
      "DOWNLOAD_UNAVAILABLE",
    );
  }
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
  };
}

export async function downloadDeliveryNotePdf(
  deliveryNoteId: string,
  fetcher: Fetcher = fetch,
  browser?: DownloadBrowser,
): Promise<string> {
  const response = await fetcher(
    `/api/delivery-notes/${deliveryNoteId}/pdf`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as
      DeliveryNoteErrorBody;
    throw new DeliveryNoteClientError(
      error.error?.message ?? "正式 PDF 下載失敗，請稍後再試",
      response.status,
      error.error?.code ?? "DOWNLOAD_FAILED",
      error.correlationId,
    );
  }
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType !== "application/pdf") {
    throw new DeliveryNoteClientError(
      "伺服器回傳的檔案格式不正確",
      response.status,
      "DOWNLOAD_CONTENT_TYPE_INVALID",
    );
  }
  const filename =
    filenameFromContentDisposition(
      response.headers.get("content-disposition"),
    ) ?? "delivery-note.pdf";
  const blob = await response.blob();
  const environment = browser ?? browserDownloadEnvironment();
  let objectUrl: string | null = null;
  let anchor: ReturnType<DownloadBrowser["createAnchor"]> | null = null;
  try {
    objectUrl = environment.createObjectUrl(blob);
    anchor = environment.createAnchor();
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    return filename;
  } finally {
    anchor?.remove();
    if (objectUrl) environment.revokeObjectUrl(objectUrl);
  }
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
