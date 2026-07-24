"use client";

import { useActionState, useMemo, useState } from "react";
import { createItem, type ItemFormState } from "./actions";
import { companyShortName } from "@/lib/company";

const initialState: ItemFormState = { success: false, message: "" };
const typeCodes: Record<string, string> = { FINISHED_GOOD: "G", RAW_MATERIAL: "R", PACKAGING: "P", CONSUMABLE: "C", OTHER: "O" };

type CompanyOption = { id: number; code: string; name: string; skuPrefix: string };
type CategoryOption = { id: number; code: string; name: string; itemType: string };
type PackageOption = { id: number; code: string; name: string };

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.length ? <p className="mt-1 text-xs font-medium text-red-600">{messages[0]}</p> : null;
}

export function ItemForm({
  companies, categories, packageTypes, nextSequences,
}: {
  companies: CompanyOption[];
  categories: CategoryOption[];
  packageTypes: PackageOption[];
  nextSequences: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState(createItem, initialState);
  const [companyId, setCompanyId] = useState("");
  const [type, setType] = useState("FINISHED_GOOD");
  const [categoryId, setCategoryId] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [codeCustomized, setCodeCustomized] = useState(false);

  const availableCategories = categories.filter((category) => category.itemType === type);
  const selectedCompany = companies.find((company) => company.id === Number(companyId));
  const selectedCategory = categories.find((category) => category.id === Number(categoryId));
  const generatedCode = useMemo(() => {
    if (!selectedCompany) return "";
    const key = `${selectedCompany.id}:${type}:${selectedCategory?.id ?? 0}`;
    return `${selectedCompany.skuPrefix}${typeCodes[type]}${selectedCategory?.code ?? "XX"}${String(nextSequences[key] ?? 1).padStart(5, "0")}`;
  }, [nextSequences, selectedCategory, selectedCompany, type]);
  const displayedCode = codeCustomized ? customCode : generatedCode;

  function resetScope(next: { companyId?: string; type?: string; categoryId?: string }) {
    if (next.companyId !== undefined) setCompanyId(next.companyId);
    if (next.type !== undefined) setType(next.type);
    if (next.categoryId !== undefined) setCategoryId(next.categoryId);
    setCodeCustomized(false);
    setCustomCode("");
  }

  return (
    <form action={formAction} className="space-y-5">
      <label className="field-label">所屬公司 <span className="text-red-500">*</span>
        <select name="companyId" className="field-input" value={companyId} onChange={(event) => resetScope({ companyId: event.target.value })} required>
          <option value="" disabled>請選擇公司</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{companyShortName(company)}</option>)}
        </select>
        <FieldError messages={state.errors?.companyId} />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="field-label">類型 <span className="text-red-500">*</span>
          <select name="type" className="field-input" value={type} onChange={(event) => resetScope({ type: event.target.value, categoryId: "" })}>
            <option value="FINISHED_GOOD">成品</option><option value="RAW_MATERIAL">原物料</option>
            <option value="PACKAGING">包材</option><option value="CONSUMABLE">耗材</option><option value="OTHER">其他</option>
          </select>
        </label>
        {availableCategories.length > 0 ? <label className="field-label">分類 <span className="text-red-500">*</span>
          <select name="categoryId" className="field-input" value={categoryId} onChange={(event) => resetScope({ categoryId: event.target.value })} required>
            <option value="" disabled>請選擇分類</option>
            {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}
          </select>
        </label> : <input type="hidden" name="categoryId" value="" />}
      </div>

      <label className="field-label">正式品名 <span className="text-red-500">*</span><input name="name" className="field-input" placeholder="例如：奇麗草本控油清爽洗髮精" required /><FieldError messages={state.errors?.name} /></label>
      <label className="field-label">品項簡稱<input name="shortName" className="field-input" placeholder="例如：草本控油洗髮精" /></label>

      <div className="grid grid-cols-2 gap-4">
        <label className="field-label">規格 <span className="text-red-500">*</span><input name="spec" className="field-input" placeholder="500ml" required /><FieldError messages={state.errors?.spec} /></label>
        <label className="field-label">包裝 <span className="text-red-500">*</span><select name="packageTypeId" className="field-input" defaultValue="" required><option value="" disabled>請選擇包裝</option>{packageTypes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      </div>

      <label className="field-label">系統品號 <span className="text-red-500">*</span>
        <div className="flex gap-2"><input name="code" className="field-input font-mono uppercase" value={displayedCode} onChange={(event) => { setCustomCode(event.target.value.toUpperCase()); setCodeCustomized(true); }} placeholder="依前面欄位自動產生" required />
          <button type="button" className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { setCodeCustomized(false); setCustomCode(""); }}>重新產生</button></div>
        <input type="hidden" name="codeCustomized" value={String(codeCustomized)} />
        <FieldError messages={state.errors?.code} />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="field-label">條碼<input name="barcode" className="field-input" placeholder="471000000001" /></label>
        <label className="field-label">安全庫存<input name="safetyStock" className="field-input" type="number" min="0" step="0.001" defaultValue="0" /></label>
      </div>

      <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4"><legend className="px-1 text-xs font-bold text-slate-500">庫存追蹤</legend><div className="mt-1 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input name="trackLot" type="checkbox" defaultChecked className="checkbox" />管理批號</label><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input name="trackExpiry" type="checkbox" className="checkbox" />管理效期</label></div></fieldset>

      {state.message && <p aria-live="polite" className={`rounded-lg px-3 py-2 text-sm font-medium ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
      <button type="submit" disabled={pending || !generatedCode || packageTypes.length === 0} className="primary-button w-full">{pending ? "儲存中…" : "新增品項"}</button>
    </form>
  );
}
