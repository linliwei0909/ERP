"use client";

import { useActionState, useEffect, useRef } from "react";
import { createPriceList, type PriceListFormState } from "./actions";
import { companyShortName } from "@/lib/company";

const initialState: PriceListFormState = { success: false, message: "" };

export function PriceListForm({ companies }: { companies: { id: number; code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createPriceList, initialState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) ref.current?.reset(); }, [state]);
  return <form ref={ref} action={action} className="space-y-5">
    <label className="field-label">所屬公司 <span className="text-red-500">*</span><select name="companyId" className="field-input" defaultValue="" required><option value="" disabled>請選擇公司</option>{companies.map((company) => <option key={company.id} value={company.id}>{companyShortName(company)}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-4"><label className="field-label">價格表代碼 <span className="text-red-500">*</span><input name="code" className="field-input" placeholder="RETAIL" required /></label><label className="field-label">類型<select name="type" className="field-input" defaultValue="SHARED"><option value="SHARED">共用</option><option value="CUSTOMER_SPECIFIC">客戶專屬</option></select></label></div>
    <label className="field-label">價格表名稱 <span className="text-red-500">*</span><input name="name" className="field-input" placeholder="經銷商價格表" required /></label>
    <label className="field-label">幣別<select name="currency" className="field-input" defaultValue="TWD"><option value="TWD">TWD 新台幣</option><option value="USD">USD 美元</option><option value="JPY">JPY 日圓</option><option value="CNY">CNY 人民幣</option></select></label>
    <label className="field-label">備註<textarea name="note" className="field-textarea" /></label>
    {state.message && <p className={`rounded-lg px-3 py-2 text-sm font-medium ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
    <button className="primary-button w-full" disabled={pending || companies.length === 0}>{pending ? "儲存中…" : "新增價格表"}</button>
  </form>;
}
