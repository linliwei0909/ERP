"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateItem, type ItemFormState } from "./actions";

const initialState: ItemFormState = { success: false, message: "" };

type EditableItem = {
  id: number; code: string; name: string; shortName: string | null; spec: string | null;
  packageTypeId: number; barcode: string | null; safetyStock: string; status: "ACTIVE" | "INACTIVE";
  trackLot: boolean; trackExpiry: boolean;
};

export function ItemEditForm({ item, packageTypes, cancelHref }: { item: EditableItem; packageTypes: { id: number; code: string; name: string }[]; cancelHref: string }) {
  const actionWithId = updateItem.bind(null, item.id);
  const [state, action, pending] = useActionState(actionWithId, initialState);

  return <form action={action} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="field-label">系統品號 <span className="text-red-500">*</span><input name="code" className="field-input font-mono uppercase" defaultValue={item.code} minLength={10} maxLength={10} required />{state.errors?.code && <p className="mt-1 text-xs text-red-600">{state.errors.code[0]}</p>}</label>
      <label className="field-label">狀態<select name="status" className="field-input" defaultValue={item.status}><option value="ACTIVE">啟用</option><option value="INACTIVE">停用</option></select></label>
    </div>
    <label className="field-label">正式品名 <span className="text-red-500">*</span><input name="name" className="field-input" defaultValue={item.name} required />{state.errors?.name && <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>}</label>
    <label className="field-label">品項簡稱<input name="shortName" className="field-input" defaultValue={item.shortName ?? ""} /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="field-label">規格 <span className="text-red-500">*</span><input name="spec" className="field-input" defaultValue={item.spec ?? ""} required />{state.errors?.spec && <p className="mt-1 text-xs text-red-600">{state.errors.spec[0]}</p>}</label>
      <label className="field-label">包裝 <span className="text-red-500">*</span><select name="packageTypeId" className="field-input" defaultValue={item.packageTypeId} required>{packageTypes.map((packageType) => <option key={packageType.id} value={packageType.id}>{packageType.code} · {packageType.name}</option>)}</select></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="field-label">條碼<input name="barcode" className="field-input" defaultValue={item.barcode ?? ""} /></label>
      <label className="field-label">安全庫存<input name="safetyStock" className="field-input" type="number" min="0" step="0.001" defaultValue={item.safetyStock} /></label>
    </div>
    <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4"><legend className="px-1 text-xs font-bold text-slate-500">庫存追蹤</legend><div className="mt-1 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input name="trackLot" type="checkbox" defaultChecked={item.trackLot} className="checkbox" />管理批號</label><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input name="trackExpiry" type="checkbox" defaultChecked={item.trackExpiry} className="checkbox" />管理效期</label></div></fieldset>
    {state.message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{state.message}</p>}
    <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><Link href={cancelHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">取消</Link><button className="primary-button" disabled={pending}>{pending ? "儲存中…" : "儲存"}</button></div>
  </form>;
}
