"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DeliveryNoteClientError,
  voidDeliveryNote,
} from "@/lib/delivery-notes/client";

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
