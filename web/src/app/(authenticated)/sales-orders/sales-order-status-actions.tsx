"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Section,
  Textarea,
} from "@/components/ui";

export function canStartSalesOrderRevision(status: string): boolean {
  return status === "CONFIRMED" || status === "DELIVERY_CREATED";
}

export function canVoidSalesOrder(status: string): boolean {
  return ["DRAFT", "CONFIRMED", "DELIVERY_CREATED"].includes(status);
}

type ActionKind = "confirm" | "revision" | "void";

type ActionRequestOutcome<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function actionIdempotencyHeaders() {
  return {
    "content-type": "application/json",
    "idempotency-key": crypto.randomUUID(),
  };
}

// Deliberately independent from sales-order-editor.tsx's performSaveRequest —
// status action robustness must not share state or a helper with draft save.
async function performStatusActionRequest<T = unknown>(
  url: string,
  body: unknown,
): Promise<ActionRequestOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: actionIdempotencyHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "網路連線異常，請稍後再試一次" };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return { ok: false, message: "伺服器回應格式異常，請稍後再試一次" };
  }
  if (!response.ok) {
    const message =
      (value as { error?: { message?: string } } | null)?.error?.message ??
      "操作失敗";
    return { ok: false, message };
  }
  return { ok: true, value: value as T };
}

export function SalesOrderStatusActions({
  orderId,
  status,
  canManage,
}: {
  orderId: string;
  status: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const actionInFlightRef = useRef(false);
  const [openDialog, setOpenDialog] = useState<ActionKind | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidReasonError, setVoidReasonError] = useState<string | null>(null);

  if (!canManage) return null;

  const canConfirm = status === "DRAFT";
  const canRevise = canStartSalesOrderRevision(status);
  const canVoid = canVoidSalesOrder(status);
  if (!canConfirm && !canRevise && !canVoid) return null;

  function closeDialog() {
    if (pending) return;
    setOpenDialog(null);
    setError(null);
    setVoidReason("");
    setVoidReasonError(null);
  }

  async function submit(kind: ActionKind, body: unknown) {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const outcome = await performStatusActionRequest(
        `/api/sales-orders/${orderId}/${kind}`,
        body,
      );
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setOpenDialog(null);
      router.refresh();
    } finally {
      actionInFlightRef.current = false;
      setPending(false);
    }
  }

  function submitVoid() {
    const trimmed = voidReason.trim();
    if (!trimmed) {
      setVoidReasonError("作廢理由必填");
      return;
    }
    setVoidReasonError(null);
    void submit("void", { reason: trimmed });
  }

  const errorAlert = error ? (
    <Alert tone="danger" title="操作失敗">
      {error}
    </Alert>
  ) : null;

  return (
    <Card>
      <Section title="訂單狀態操作">
        <div className="flex flex-wrap gap-3">
          {canConfirm ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => setOpenDialog("confirm")}
            >
              確認訂單
            </Button>
          ) : null}
          {canRevise ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpenDialog("revision")}
            >
              開始修訂
            </Button>
          ) : null}
          {canVoid ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => setOpenDialog("void")}
            >
              作廢訂單
            </Button>
          ) : null}
        </div>
      </Section>

      <ConfirmDialog
        open={openDialog === "confirm"}
        title="確認訂單"
        description="此操作會將草稿確認為正式訂單。確認後無法直接編輯，如需修改須開始修訂。"
        confirmLabel="確認訂單"
        pending={pending}
        onCancel={closeDialog}
        onConfirm={() => void submit("confirm", {})}
      >
        {errorAlert}
      </ConfirmDialog>

      <ConfirmDialog
        open={openDialog === "revision"}
        title="開始修訂"
        description="此操作會將訂單狀態改回草稿以便編輯，系統會自動遞增修訂版次。若目前訂單已建立銷貨單，系統會依既有規則檢查銷貨單狀態與版次是否允許開始修訂。"
        confirmLabel="開始修訂"
        pending={pending}
        onCancel={closeDialog}
        onConfirm={() => void submit("revision", {})}
      >
        {errorAlert}
      </ConfirmDialog>

      <ConfirmDialog
        open={openDialog === "void"}
        title="作廢訂單"
        description="作廢後無法復原。若訂單目前有有效銷貨單，系統將依既有規則一併作廢。"
        confirmLabel="確認作廢"
        destructive
        pending={pending}
        onCancel={closeDialog}
        onConfirm={submitVoid}
      >
        {errorAlert}
        <Field label="作廢原因" error={voidReasonError} required>
          <Textarea
            value={voidReason}
            disabled={pending}
            rows={3}
            onChange={(event) => setVoidReason(event.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}
