"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
      setMessage("正式 PDF 已開始下載");
    } catch (error) {
      setMessage(
        error instanceof DeliveryNoteClientError
          ? error.message
          : "正式 PDF 下載失敗，請稍後再試",
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
        setMessage(
          operation === "formal-print"
            ? "正式列印完成，PDF 已開始下載"
            : "補印紀錄完成，PDF 已開始下載",
        );
      } catch {
        setMessage(
          operation === "formal-print"
            ? "正式列印已完成，但 PDF 下載失敗；請使用「下載 PDF」重試"
            : "補印紀錄已完成，但 PDF 下載失敗；請只重試下載",
        );
      }
    } catch (error) {
      if (
        error instanceof DeliveryNoteClientError &&
        error.status === 409
      ) {
        router.refresh();
      }
      setMessage(
        error instanceof DeliveryNoteClientError
          ? error.message
          : "列印操作未確認完成；請使用相同操作重試",
      );
    } finally {
      busy.current = false;
      setMutationPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message ? (
        <span role="status" className="max-w-md text-sm text-slate-700">
          {message}
        </span>
      ) : null}
      {capabilities.canDownload ? (
        <button
          type="button"
          disabled={downloadPending || mutationPending}
          onClick={download}
          className="rounded-lg border border-teal-700 px-4 py-2 text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloadPending ? "下載中…" : "下載 PDF"}
        </button>
      ) : null}
      {capabilities.canFormalPrint ? (
        <button
          type="button"
          disabled={mutationPending}
          onClick={() => openDialog("formal-print")}
          className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          正式列印
        </button>
      ) : null}
      {capabilities.canReprint ? (
        <button
          type="button"
          disabled={mutationPending}
          onClick={() => openDialog("reprint")}
          className="rounded-lg bg-slate-800 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          補印
        </button>
      ) : null}
      {dialog ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={dialog === "formal-print" ? "確認正式列印" : "確認補印"}
          className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          <h2 className="font-bold text-slate-900">
            {dialog === "formal-print" ? "確認正式列印" : "確認補印"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {dialog === "formal-print"
              ? "此操作會將銷貨單與來源訂單標記為已出貨、寫入實際出貨日，並建立不可變的正式 PDF。"
              : "此操作會新增一筆補印紀錄並增加補印次數，正式 PDF 內容不會重新產生。"}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={mutationPending}
              onClick={() => setDialog(null)}
              className="rounded-lg border px-3 py-2 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={mutationPending}
              onClick={submitPrint}
              className="rounded-lg bg-teal-700 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutationPending ? "處理中…" : "確認"}
            </button>
          </div>
        </div>
      ) : null}
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (busy.current) return;
    if (!reason.trim()) {
      setMessage("作廢理由必填");
      return;
    }
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      await voidDeliveryNote(deliveryNoteId, reason);
      setMessage("銷貨單已作廢");
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof DeliveryNoteClientError
          ? error.message
          : "銷貨單作廢失敗，請稍後再試",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        {message ? (
          <span role="status" className="text-sm text-slate-600">
            {message}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-rose-700 px-4 py-2 text-white"
        >
          管理員作廢
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-4 shadow-lg">
      <label className="block text-sm font-semibold text-slate-800">
        作廢原因
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      {message ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {message}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        作廢會保留完整紀錄，不會刪除交易資料。
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setMessage("");
          }}
          className="rounded-lg border px-3 py-2 disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-lg bg-rose-700 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "處理中…" : "確認作廢"}
        </button>
      </div>
    </div>
  );
}
