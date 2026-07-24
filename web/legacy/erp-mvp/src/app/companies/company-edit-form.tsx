"use client";

import { useActionState, useEffect } from "react";
import { updateCompany, type CompanyFormState } from "./actions";

const initialState: CompanyFormState = { success: false, message: "" };

export function CompanyEditForm({ company, onCancel, onSaved }: { company: { id: number; code: string; skuPrefix: string; name: string; status: "ACTIVE" | "INACTIVE"; note: string | null }; onCancel: () => void; onSaved: () => void }) {
  const actionWithId = updateCompany.bind(null, company.id);
  const [state, action, pending] = useActionState(actionWithId, initialState);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);

  return <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="field-label">公司代碼 <span className="text-red-500">*</span><input name="code" className="field-input uppercase" defaultValue={company.code} minLength={4} maxLength={4} required />{state.errors?.code && <p className="mt-1 text-xs text-red-600">{state.errors.code[0]}</p>}</label>
      <label className="field-label">SKU 前綴 <span className="text-red-500">*</span><input name="skuPrefix" className="field-input uppercase" defaultValue={company.skuPrefix} minLength={2} maxLength={2} required />{state.errors?.skuPrefix && <p className="mt-1 text-xs text-red-600">{state.errors.skuPrefix[0]}</p>}</label>
      <label className="field-label sm:col-span-2">公司名稱 <span className="text-red-500">*</span><input name="name" className="field-input" defaultValue={company.name} required />{state.errors?.name && <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>}</label>
      <label className="field-label">狀態<select name="status" className="field-input" defaultValue={company.status}><option value="ACTIVE">啟用</option><option value="INACTIVE">停用</option></select></label>
      <label className="field-label">備註<input name="note" className="field-input" defaultValue={company.note ?? ""} /></label>
      {state.message && <p className={`sm:col-span-2 rounded-lg px-3 py-2 text-sm font-medium ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
      <div className="flex justify-end gap-3 sm:col-span-2"><button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onCancel}>取消</button><button className="primary-button" disabled={pending}>{pending ? "儲存中…" : "儲存"}</button></div>
    </form>
  ;
}
