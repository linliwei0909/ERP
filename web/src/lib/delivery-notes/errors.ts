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
