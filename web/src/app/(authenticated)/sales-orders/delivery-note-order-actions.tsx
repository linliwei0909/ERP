"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryNoteSummaryDto } from "@/lib/delivery-notes/api-types";
import {
  createDeliveryNote,
  DeliveryNoteClientError,
  rebuildDeliveryNote,
} from "@/lib/delivery-notes/client";

export function deliveryNoteOrderAction(input: {
  orderStatus: string;
  revisionNo: number;
  notes: DeliveryNoteSummaryDto[];
  canManage: boolean;
}): "create" | "rebuild" | null {
  if (!input.canManage || input.orderStatus !== "CONFIRMED") return null;
  const current = input.notes.find((note) => note.status !== "VOIDED");
  if (!current) return "create";
  return current.salesOrderRevisionNo < input.revisionNo
    ? "rebuild"
    : null;
}

export function DeliveryNoteOrderActions({
  salesOrderId,
  orderStatus,
  revisionNo,
  notes,
  canManage,
}: {
  salesOrderId: string;
  orderStatus: string;
  revisionNo: number;
  notes: DeliveryNoteSummaryDto[];
  canManage: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const action = deliveryNoteOrderAction({
    orderStatus,
    revisionNo,
    notes,
    canManage,
  });
  const current = notes.find((note) => note.status !== "VOIDED");

  async function submit() {
    if (!action || busy.current) return;
    if (action === "rebuild" && !reason.trim()) {
      setMessage("重建理由必填");
      return;
    }
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const result =
        action === "create"
          ? await createDeliveryNote(salesOrderId, revisionNo)
          : await rebuildDeliveryNote(
              salesOrderId,
              revisionNo,
              reason,
            );
      setMessage(action === "create" ? "銷貨單建立成功" : "銷貨單重建成功");
      router.push(`/delivery-notes/${result.deliveryNote.id}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof DeliveryNoteClientError
          ? error.message
          : "銷貨單操作失敗，請稍後再試",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-950">銷貨單</h2>
          <p className="mt-1 text-sm text-slate-600">
            銷貨單只能由已確認訂單明確建立，不提供自由輸入表單。
          </p>
        </div>
        {current ? (
          <Link
            href={`/delivery-notes/${current.id}`}
            className="rounded-lg bg-teal-700 px-4 py-2 text-white"
          >
            查看目前銷貨單
          </Link>
        ) : null}
      </div>

      {notes.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/delivery-notes/${note.id}`}
              className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm"
            >
              {note.deliveryNoteNumber}－
              {note.status === "VOIDED" ? "已作廢" : "有效"}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">目前尚無銷貨單。</p>
      )}

      {action === "rebuild" ? (
        <label className="mt-4 block max-w-xl text-sm font-semibold text-slate-800">
          重建原因
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
      ) : null}

      {message ? (
        <p
          role={message.includes("成功") ? "status" : "alert"}
          className="mt-3 text-sm font-medium text-slate-700"
        >
          {message}
        </p>
      ) : null}

      {action ? (
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "處理中…"
            : action === "create"
              ? "建立銷貨單"
              : "重建銷貨單"}
        </button>
      ) : null}

      {!canManage ? (
        <p className="mt-4 text-sm text-slate-500">
          目前帳號只有檢視權限，無法建立或重建銷貨單。
        </p>
      ) : null}
    </section>
  );
}
