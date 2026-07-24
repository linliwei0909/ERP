"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPriceListItem, type PriceListFormState } from "./actions";

type PriceListOption = { id: number; companyId: number; code: string; name: string; currency: string };
type ItemOption = { id: number; companyName: string; code: string; name: string; spec: string | null; unit: string };

const initialState: PriceListFormState = { success: false, message: "" };

export function PriceListItemForm({ priceLists, items }: { priceLists: PriceListOption[]; items: ItemOption[] }) {
  const [state, action, pending] = useActionState(createPriceListItem, initialState);
  const [priceListId, setPriceListId] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const selectedPriceList = priceLists.find((priceList) => priceList.id === Number(priceListId));

  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);

  return <form ref={ref} action={action} className="space-y-5">
    <label className="field-label">價格表 <span className="text-red-500">*</span>
      <select name="priceListId" className="field-input" value={priceListId} onChange={(event) => setPriceListId(event.target.value)} required>
        <option value="" disabled>請選擇價格表</option>
        {priceLists.map((priceList) => <option key={priceList.id} value={priceList.id}>{priceList.code} · {priceList.name}</option>)}
      </select>
    </label>
    <label className="field-label">品項 <span className="text-red-500">*</span>
      <select name="itemId" className="field-input" defaultValue="" disabled={!selectedPriceList} required>
        <option value="" disabled>{selectedPriceList ? "請選擇品項" : "請先選擇價格表"}</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.companyName} · {item.code} · {item.name}{item.spec ? ` · ${item.spec}` : ""}</option>)}
      </select>
    </label>
    <label className="field-label">單價（{selectedPriceList?.currency ?? "幣別"}） <span className="text-red-500">*</span>
      <input name="unitPrice" className="field-input" type="number" min="0" step="0.0001" placeholder="0.00" required />
    </label>
    {state.message && <p className={`rounded-lg px-3 py-2 text-sm font-medium ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
    <button className="primary-button w-full" disabled={pending || priceLists.length === 0 || items.length === 0}>{pending ? "儲存中…" : "新增價格明細"}</button>
  </form>;
}
