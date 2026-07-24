"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCompany, type CompanyFormState } from "./actions";

const initialState: CompanyFormState = { success: false, message: "" };

export function CompanyForm({ onCancel }: { onCancel?: () => void }) {
  const [state, action, pending] = useActionState(createCompany, initialState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) ref.current?.reset(); }, [state]);
  return <form ref={ref} action={action} className="space-y-5">
    <label className="field-label">公司代碼 <span className="text-red-500">*</span><input name="code" className="field-input uppercase" placeholder="CI01" minLength={4} maxLength={4} required />{state.errors?.code && <p className="mt-1 text-xs text-red-600">{state.errors.code[0]}</p>}</label>
    <label className="field-label">SKU 前綴 <span className="text-red-500">*</span><input name="skuPrefix" className="field-input uppercase" placeholder="CI" minLength={2} maxLength={2} required />{state.errors?.skuPrefix && <p className="mt-1 text-xs text-red-600">{state.errors.skuPrefix[0]}</p>}</label>
    <label className="field-label">公司名稱 <span className="text-red-500">*</span><input name="name" className="field-input" placeholder="奇麗實業" required />{state.errors?.name && <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>}</label>
    <label className="field-label">備註<textarea name="note" className="field-textarea" /></label>
    {state.message && <p className={`rounded-lg px-3 py-2 text-sm font-medium ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
    <div className="flex justify-end gap-3"><button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onCancel}>取消</button><button className="primary-button" disabled={pending}>{pending ? "儲存中…" : "新增公司"}</button></div>
  </form>;
}
