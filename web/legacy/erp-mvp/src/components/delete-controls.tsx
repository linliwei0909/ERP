"use client";

import { useActionState, useRef, useState } from "react";
import { initialDeleteResult, type DeleteResult } from "@/lib/delete-result";

type DeleteAction = (state: DeleteResult, formData: FormData) => Promise<DeleteResult>;

function ResultMessage({ result }: { result: DeleteResult }) {
  if (!result.message) return null;
  return <div className={`border-b px-6 py-3 text-sm ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
    <p className="font-semibold">{result.message}</p>
    {result.deactivated.map((message) => <p key={message} className="mt-1 text-xs">{message}</p>)}
  </div>;
}

export function BulkDeleteForm({ action, noun, children }: { action: DeleteAction; noun: string; children: React.ReactNode }) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [result, formAction, pending] = useActionState(async (state: DeleteResult, formData: FormData) => {
    const nextResult = await action(state, formData);
    setConfirming(false);
    return nextResult;
  }, initialDeleteResult);
  const formRef = useRef<HTMLFormElement>(null);

  function recount() {
    setSelectedCount(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length ?? 0);
  }

  return <form ref={formRef} action={formAction} onChange={recount}>
    {selectedCount > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-6 py-3"><p className="text-sm font-semibold text-red-800">已選 {selectedCount} 筆</p><button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700" onClick={() => setConfirming(true)}>刪除選取資料</button></div>}
    <ResultMessage result={result} />
    {children}
    {confirming && <div className="modal-backdrop" role="presentation"><section className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="bulk-delete-title"><h2 id="bulk-delete-title" className="text-xl font-bold text-slate-900">確認刪除{noun}</h2><p className="mt-3 text-sm leading-6 text-slate-600">確定要處理選取的 {selectedCount} 筆資料嗎？未被引用的資料會永久刪除；已被引用的資料會改為停用。</p><div className="mt-6 flex justify-end gap-3"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => setConfirming(false)}>取消</button><button type="submit" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white" disabled={pending}>{pending ? "處理中…" : "確認刪除"}</button></div></section></div>}
  </form>;
}

export function SelectAllCheckbox() {
  return <input type="checkbox" className="checkbox" aria-label="全選目前清單" onChange={(event) => {
    const form = event.currentTarget.form;
    form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((input) => { input.checked = event.currentTarget.checked; });
  }} />;
}

export function RowCheckbox({ id, label }: { id: number; label: string }) {
  return <input type="checkbox" name="ids" value={id} className="checkbox" aria-label={`選取${label}`} onClick={(event) => event.stopPropagation()} />;
}

export function DeleteRecordButton({ action, id, name }: { action: DeleteAction; id: number; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [result, formAction, pending] = useActionState(async (state: DeleteResult, formData: FormData) => {
    const nextResult = await action(state, formData);
    setConfirming(false);
    return nextResult;
  }, initialDeleteResult);

  return <form action={formAction} className="contents"><input type="hidden" name="ids" value={id} /><button type="button" className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => setConfirming(true)}>刪除</button>{result.message && <p className="basis-full text-right text-xs text-red-700">{result.message}{result.deactivated.length ? `：${result.deactivated.join("；")}` : ""}</p>}{confirming && <div className="modal-backdrop" role="presentation"><section className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="record-delete-title"><h2 id="record-delete-title" className="text-xl font-bold">確認刪除</h2><p className="mt-3 text-sm leading-6 text-slate-600">確定要刪除「{name}」嗎？若已有其他資料引用，系統會改為停用。</p><div className="mt-6 flex justify-end gap-3"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => setConfirming(false)}>取消</button><button type="submit" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white" disabled={pending}>{pending ? "處理中…" : "確認刪除"}</button></div></section></div>}</form>;
}
