"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmDialog, Field, Textarea } from "@/components/ui";
import {
  createPrintMutationSession,
  DeliveryNoteClientError,
  downloadDeliveryNotePdf,
  voidDeliveryNote,
} from "@/lib/delivery-notes/client";
import type {
  DeliveryNotePrintCapabilities,
} from "@/lib/delivery-notes/types";

export function deliveryNotePrintActions(input: {
  status: string;
  hasFormalPdf: boolean;
  canManage: boolean;
  canRead: boolean;
}): DeliveryNotePrintCapabilities {
  return {
    canFormalPrint:
      input.status === "ACTIVE" &&
      !input.hasFormalPdf &&
      input.canManage,
    canReprint:
      input.status === "SHIPPED" &&
      input.hasFormalPdf &&
      input.canManage,
    canDownload: input.hasFormalPdf && input.canRead,
  };
}

type FeedbackTone = "success" | "warning" | "danger";

export function DeliveryNotePrintActions({
  deliveryNoteId,
  capabilities,
}: {
  deliveryNoteId: string;
  capabilities: DeliveryNotePrintCapabilities;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const session = useRef<ReturnType<
    typeof createPrintMutationSession
  > | null>(null);
  const [dialog, setDialog] = useState<"formal-print" | "reprint" | null>(
    null,
  );
  const [mutationPending, setMutationPending] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<FeedbackTone>("success");

  function announce(text: string, nextTone: FeedbackTone) {
    setMessage(text);
    setTone(nextTone);
  }

  function openDialog(operation: "formal-print" | "reprint") {
    setMessage("");
    setDialog(operation);
    if (!session.current) {
      session.current = createPrintMutationSession(
        operation,
        deliveryNoteId,
      );
    }
  }

  async function download() {
    if (downloadPending) return;
    setDownloadPending(true);
    setMessage("");
    try {
      await downloadDeliveryNotePdf(deliveryNoteId);
      announce("正式 PDF 已開始下載", "success");
    } catch (error) {
      announce(
        error instanceof DeliveryNoteClientError
          ? error.message
          : "正式 PDF 下載失敗，請稍後再試",
        "danger",
      );
    } finally {
      setDownloadPending(false);
    }
  }

  async function submitPrint() {
    if (busy.current || !dialog || !session.current) return;
    busy.current = true;
    setMutationPending(true);
    setMessage("");
    const operation = dialog;
    try {
      await session.current.execute();
      session.current = null;
      setDialog(null);
      router.refresh();
      try {
        await downloadDeliveryNotePdf(deliveryNoteId);
        announce(
          operation === "formal-print"
            ? "正式列印完成，PDF 已開始下載"
            : "補印紀錄完成，PDF 已開始下載",
          "success",
        );
      } catch {
        announce(
          operation === "formal-print"
            ? "正式列印已完成，但 PDF 下載失敗；請使用「下載 PDF」重試"
            : "補印紀錄已完成，但 PDF 下載失敗；請只重試下載",
          "warning",
        );
      }
    } catch (error) {
      if (
        error instanceof DeliveryNoteClientError &&
        error.status === 409
      ) {
        router.refresh();
      }
      announce(
        error instanceof DeliveryNoteClientError
          ? error.message
          : "列印操作未確認完成；請使用相同操作重試",
        "danger",
      );
    } finally {
      busy.current = false;
      setMutationPending(false);
    }
  }

  const topLevelFeedback = !dialog && message ? (
    <Alert tone={tone}>{message}</Alert>
  ) : null;
  const dialogFeedback = dialog && message ? (
    <Alert tone={tone}>{message}</Alert>
  ) : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {topLevelFeedback}
      {capabilities.canDownload ? (
        <Button
          type="button"
          variant="secondary"
          disabled={mutationPending}
          pending={downloadPending}
          pendingLabel="下載中"
          onClick={download}
        >
          下載 PDF
        </Button>
      ) : null}
      {capabilities.canFormalPrint ? (
        <Button
          type="button"
          variant="primary"
          disabled={mutationPending}
          onClick={() => openDialog("formal-print")}
        >
          正式列印
        </Button>
      ) : null}
      {capabilities.canReprint ? (
        <Button
          type="button"
          variant="secondary"
          disabled={mutationPending}
          onClick={() => openDialog("reprint")}
        >
          補印
        </Button>
      ) : null}
      <ConfirmDialog
        open={dialog !== null}
        title={dialog === "formal-print" ? "確認正式列印" : "確認補印"}
        description={
          dialog === "formal-print"
            ? "此操作會將銷貨單與來源訂單標記為已出貨、寫入實際出貨日，並建立不可變的正式 PDF。"
            : "此操作會新增一筆補印紀錄並增加補印次數，正式 PDF 內容不會重新產生。"
        }
        confirmLabel="確認"
        pending={mutationPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => void submitPrint()}
      >
        {dialogFeedback}
      </ConfirmDialog>
    </div>
  );
}

export function DeliveryNoteVoidAction({
  deliveryNoteId,
}: {
  deliveryNoteId: string;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<Exclude<FeedbackTone, "warning">>(
    "success",
  );

  async function submit() {
    if (busy.current) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("作廢理由必填");
      setMessage("");
      setTone("success");
      return;
    }
    busy.current = true;
    setReasonError(null);
    setPending(true);
    setMessage("");
    try {
      await voidDeliveryNote(deliveryNoteId, reason);
      setMessage("銷貨單已作廢");
      setTone("success");
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof DeliveryNoteClientError
          ? error.message
          : "銷貨單作廢失敗，請稍後再試",
      );
      setTone("danger");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!open && message ? <Alert tone={tone}>{message}</Alert> : null}
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        管理員作廢
      </Button>
      <ConfirmDialog
        open={open}
        title="確認作廢銷貨單"
        description="作廢會保留完整紀錄，不會刪除交易資料。"
        confirmLabel="確認作廢"
        destructive
        pending={pending}
        onCancel={() => {
          setOpen(false);
          setReasonError(null);
          setMessage("");
        }}
        onConfirm={() => void submit()}
      >
        {open && message ? <Alert tone={tone}>{message}</Alert> : null}
        <Field label="作廢原因" error={reasonError} required>
          <Textarea
            value={reason}
            disabled={pending}
            maxLength={1000}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
