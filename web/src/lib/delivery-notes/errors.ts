export class DeliveryNoteNotFoundError extends Error {
  readonly code = "DELIVERY_NOTE_NOT_FOUND";

  constructor() {
    super("找不到指定的銷貨單");
  }
}

export class DeliveryNoteAccessDeniedError extends Error {
  readonly code = "DELIVERY_NOTE_ACCESS_DENIED";

  constructor() {
    super("沒有存取該銷貨單的權限");
  }
}

export class DeliveryNotePrerequisiteError extends Error {
  readonly code = "DELIVERY_NOTE_PREREQUISITE_MISSING";

  constructor(message: string) {
    super(message);
  }
}

export class DeliveryNoteAlreadyExistsError extends Error {
  readonly code = "DELIVERY_NOTE_ALREADY_EXISTS";

  constructor() {
    super("此訂單已有未作廢的銷貨單");
  }
}

export class DeliveryNoteRevisionMismatchError extends Error {
  readonly code = "DELIVERY_NOTE_REVISION_MISMATCH";

  constructor() {
    super("訂單版次與目前銷貨單不一致，必須使用正式重建流程");
  }
}

export class DeliveryNoteRebuildRequiredError extends Error {
  readonly code = "DELIVERY_NOTE_REBUILD_REQUIRED";

  constructor() {
    super("訂單已有前一版銷貨單，必須執行正式重建流程");
  }
}

export class DeliveryNoteRebuildNotAllowedError extends Error {
  readonly code = "DELIVERY_NOTE_REBUILD_NOT_ALLOWED";

  constructor(message = "目前狀態不可重建銷貨單") {
    super(message);
  }
}

export class DeliveryNoteReplacementConflictError extends Error {
  readonly code = "DELIVERY_NOTE_REPLACEMENT_CONFLICT";

  constructor() {
    super("銷貨單取代關係已存在或不一致");
  }
}

export class DeliveryNoteAdminVoidNotAllowedError extends Error {
  readonly code = "DELIVERY_NOTE_ADMIN_VOID_NOT_ALLOWED";

  constructor(message = "目前狀態不可由管理員直接作廢銷貨單") {
    super(message);
  }
}

export class DeliveryNoteVoidReasonRequiredError extends Error {
  readonly code = "DELIVERY_NOTE_VOID_REASON_REQUIRED";

  constructor() {
    super("作廢理由必填");
  }
}

export class DeliveryNoteDownstreamLockedError extends Error {
  readonly code = "DELIVERY_NOTE_DOWNSTREAM_LOCKED";

  constructor() {
    super("銷貨單已出貨或已建立應收，不可執行此操作");
  }
}

export class DeliveryNoteIdempotencyConflictError extends Error {
  readonly code = "DELIVERY_NOTE_IDEMPOTENCY_CONFLICT";

  constructor() {
    super("相同冪等鍵不可搭配不同的銷貨單建立內容");
  }
}

export class DeliveryNoteInvariantError extends Error {
  readonly code = "DELIVERY_NOTE_INVARIANT_VIOLATION";

  constructor(message: string) {
    super(message);
  }
}

export class DeliveryNotePrintError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: {
      deliveryNoteId?: string;
      snapshotVersion?: string;
      path?: string;
      reason?: string;
    } = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class DeliveryNoteSnapshotValidationError extends DeliveryNotePrintError {
  constructor(input: {
    deliveryNoteId: string;
    snapshotVersion: string;
    path: string;
    reason: string;
    code?: "DELIVERY_NOTE_SNAPSHOT_VERSION_UNSUPPORTED" | "DELIVERY_NOTE_SNAPSHOT_INVALID";
  }) {
    super(
      input.code ?? "DELIVERY_NOTE_SNAPSHOT_INVALID",
      `銷貨單快照欄位 ${input.path} 無效：${input.reason}`,
      input,
    );
  }
}

export class DeliveryNotePrintStateError extends DeliveryNotePrintError {
  constructor(message = "目前銷貨單狀態不可執行正式列印") {
    super("DELIVERY_NOTE_PRINT_STATE_INVALID", message);
  }
}

export class DeliveryNoteSalesOrderStateError extends DeliveryNotePrintError {
  constructor(message = "來源訂單狀態不可轉為已出貨") {
    super("DELIVERY_NOTE_SALES_ORDER_STATE_INVALID", message);
  }
}

export class DeliveryNoteFormalPrintExistsError extends DeliveryNotePrintError {
  constructor() {
    super("DELIVERY_NOTE_FORMAL_PRINT_EXISTS", "銷貨單已有正式列印版本");
  }
}

export class DeliveryNoteFormalPrintMissingError extends DeliveryNotePrintError {
  constructor() {
    super("DELIVERY_NOTE_FORMAL_PRINT_MISSING", "銷貨單尚無正式列印版本");
  }
}

export class DeliveryNoteFontError extends DeliveryNotePrintError {
  constructor(
    code:
      | "DELIVERY_NOTE_FONT_MISSING"
      | "DELIVERY_NOTE_FONT_CHECKSUM_MISMATCH"
      | "DELIVERY_NOTE_FONT_PARSE_FAILED"
      | "DELIVERY_NOTE_FONT_GLYPH_MISSING",
    message: string,
  ) {
    super(code, message);
  }
}

export class DeliveryNotePdfRenderError extends DeliveryNotePrintError {
  constructor(
    code:
      | "DELIVERY_NOTE_PDF_RENDER_FAILED"
      | "DELIVERY_NOTE_PDF_INVALID"
      | "DELIVERY_NOTE_PDF_CHECKSUM_MISMATCH"
      | "DELIVERY_NOTE_PRINT_STORAGE_INVALID",
    message: string,
  ) {
    super(code, message);
  }
}

export class DeliveryNotePrintConcurrencyError extends DeliveryNotePrintError {
  constructor(message = "正式列印操作發生併發衝突，請稍後重試") {
    super("DELIVERY_NOTE_PRINT_CONCURRENCY_CONFLICT", message);
  }
}
