"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomer, type CustomerFormState } from "./actions";
import { companyShortName } from "@/lib/company";

const initialState: CustomerFormState = { success: false, message: "" };

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.length ? <p className="mt-1 text-xs font-medium text-red-600">{messages[0]}</p> : null;
}

type CompanyOption = {
  id: number;
  code: string;
  name: string;
  priceLists: { id: number; code: string; name: string }[];
};

export function CustomerForm({ companies }: { companies: CompanyOption[] }) {
  const [state, formAction, pending] = useActionState(createCustomer, initialState);
  const [companyId, setCompanyId] = useState("");
  const [priceListChoice, setPriceListChoice] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const selectedCompany = companies.find((company) => company.id === Number(companyId));

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.replace("/customers");
    }
  }, [router, state.success]);

  const field = (name: string, label: string, placeholder = "", required = false) => (
    <label className="field-label">
      {label} {required && <span className="text-red-500">*</span>}
      <input name={name} className="field-input" placeholder={placeholder} required={required} />
      <FieldError messages={state.errors?.[name]} />
    </label>
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
        客戶代碼由系統自動產生，例如 C000001。客戶只歸屬一家銷售公司，但價格表可包含不同產品公司的品項。
      </div>

      <fieldset className="form-section">
        <legend>客戶基本資料</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "客戶名稱／簡稱", "例如：和美商行", true)}
          {field("legalName", "公司全名", "發票抬頭")}
          {field("taxId", "統一編號", "12345678")}
          {field("source", "客戶來源", "例如：官網、轉介紹")}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>銷售歸屬與價格</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">銷售公司 <span className="text-red-500">*</span>
            <select name="companyId" className="field-input" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setPriceListChoice(""); }} required>
              <option value="" disabled>請選擇銷售公司</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{companyShortName(company)}</option>)}
            </select>
            <FieldError messages={state.errors?.companyId} />
          </label>
          <label className="field-label">價格表 <span className="text-red-500">*</span>
            <select name="priceListChoice" className="field-input" value={priceListChoice} onChange={(event) => setPriceListChoice(event.target.value)} disabled={!selectedCompany} required>
              <option value="" disabled>{selectedCompany ? "請選擇價格表" : "請先選擇銷售公司"}</option>
              {selectedCompany?.priceLists.map((priceList) => <option key={priceList.id} value={priceList.id}>{priceList.code} · {priceList.name}</option>)}
              {selectedCompany && <option value="CREATE_NEW">＋新增客戶專屬價格表</option>}
            </select>
            <FieldError messages={state.errors?.priceListChoice} />
          </label>
          <label className="field-label">客戶類型
            <select name="type" className="field-input" defaultValue="RETAIL"><option value="DISTRIBUTOR">經銷</option><option value="RETAIL">零售</option></select>
          </label>
          <label className="field-label">使用狀態
            <select name="status" className="field-input" defaultValue="ACTIVE"><option value="ACTIVE">啟用</option><option value="INACTIVE">停用</option></select>
          </label>
          <label className="field-label">付款條件<input name="paymentTerms" className="field-input" placeholder="例如：月結 30 天" /></label>
          <label className="field-label">信用額度<input name="creditLimit" type="number" min="0" step="0.01" defaultValue="0" className="field-input" /></label>
          <label className="field-label">業務負責人<input name="salesOwner" className="field-input" placeholder="內部負責人" /></label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>主要聯絡人</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("contactName", "聯絡人", "王小明")}{field("contactTitle", "職稱", "採購經理")}
          {field("phone", "公司電話", "02-2345-6789")}{field("mobile", "行動電話", "0912-345-678")}
          {field("email", "Email", "contact@example.com")}{field("website", "網站", "https://example.com")}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>地址</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("address", "客戶地址（預設送貨地址）", "訂單未另選地址時使用")}
          {field("invoiceAddress", "帳單／發票地址", "若與客戶地址不同再填寫")}
        </div>
        <label className="field-label mt-4">備註<textarea name="note" className="field-textarea" placeholder="特殊交貨、對帳或聯絡注意事項" /></label>
      </fieldset>

      {state.message && <p aria-live="polite" className={`rounded-lg px-3 py-2 text-sm font-medium ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button type="button" onClick={() => router.replace("/customers")} className="secondary-button">取消</button>
        <button type="submit" disabled={pending || companies.length === 0} className="primary-button">{pending ? "儲存中…" : "新增客戶"}</button>
      </div>
    </form>
  );
}
