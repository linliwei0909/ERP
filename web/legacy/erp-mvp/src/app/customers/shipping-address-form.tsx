"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createShippingAddress, type ShippingAddressFormState } from "./actions";

type CustomerOption = { id: number; code: string; name: string };
const initialState: ShippingAddressFormState = { success: false, message: "" };

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.length ? <p className="mt-1 text-xs font-medium text-red-600">{messages[0]}</p> : null;
}

export function ShippingAddressForm({ customer }: { customer: CustomerOption }) {
  const [state, formAction, pending] = useActionState(createShippingAddress, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.replace(`/customers?id=${customer.id}`);
    }
  }, [customer.id, router, state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="customerId" value={customer.id} />
      <div className="rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-800">
        新地址將加入 <strong>{customer.code} · {customer.name}</strong>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">地址名稱 <span className="text-red-500">*</span><input name="label" className="field-input" placeholder="例如：台北門市" required /><FieldError messages={state.errors?.label} /></label>
        <label className="field-label">郵遞區號<input name="postalCode" className="field-input" placeholder="110" /></label>
        <label className="field-label">收件人<input name="recipientName" className="field-input" placeholder="王小明" /></label>
        <label className="field-label">收件電話<input name="recipientPhone" className="field-input" placeholder="0912-345-678" /></label>
      </div>
      <label className="field-label">完整地址 <span className="text-red-500">*</span><input name="address" className="field-input" placeholder="縣市、區域、路段巷弄及樓層" required /><FieldError messages={state.errors?.address} /></label>
      <label className="field-label">運費加價（TWD）<input name="shippingFeeMarkup" type="number" min="0" step="1" defaultValue="0" className="field-input" /><FieldError messages={state.errors?.shippingFeeMarkup} /></label>
      <label className="field-label">備註<textarea name="note" className="field-textarea" placeholder="收貨時段、卸貨或聯絡注意事項" /></label>
      {state.message && <p aria-live="polite" className={`rounded-lg px-3 py-2 text-sm font-medium ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
      <div className="flex justify-end gap-3"><button type="button" className="secondary-button" onClick={() => router.replace(`/customers?id=${customer.id}`)}>取消</button><button type="submit" disabled={pending} className="primary-button">{pending ? "儲存中…" : "新增送貨地址"}</button></div>
    </form>
  );
}
