"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchButton } from "@/components/search-button";
import { CompanyForm } from "./company-form";
import { CompanyEditForm } from "./company-edit-form";
import { BulkDeleteForm, DeleteRecordButton, RowCheckbox, SelectAllCheckbox } from "@/components/delete-controls";
import { deleteCompanies } from "./actions";

type CompanyRow = {
  id: number; code: string; skuPrefix: string; name: string; status: "ACTIVE" | "INACTIVE"; note: string | null;
  customerCount: number; priceListCount: number;
};

export function CompanyManager({ companies }: { companies: CompanyRow[] }) {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const selected = companies.find((company) => company.id === selectedId) ?? null;
  const filteredCompanies = query.trim()
    ? companies.filter((company) =>
        [company.code, company.skuPrefix, company.name, company.status === "ACTIVE" ? "啟用" : "停用"]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : companies;
  const modalOpen = creating || selected !== null;
  const finishEditing = useCallback(() => setEditing(false), []);

  useEffect(() => {
    if (!modalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setCreating(false); setSelectedId(null); setEditing(false); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modalOpen]);

  function closeModal() { setCreating(false); setSelectedId(null); setEditing(false); }

  return <>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">系統設定</p><h1 className="page-title">公司主檔</h1><p className="mt-2 text-sm text-slate-500">管理 ERP 的公司別與資料邊界。</p></div><button className="primary-button" onClick={() => setCreating(true)}>新增公司</button></header>
    <BulkDeleteForm key={companies.map((company) => company.id).join("-")} action={deleteCompanies} noun="公司"><section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
        <div><h2 className="font-bold text-slate-900">公司清單</h2><p className="mt-1 text-xs text-slate-500">共 {companies.length} 家公司</p></div>
        <div className="flex min-w-64 gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="field-input mt-0" placeholder="搜尋公司代碼、名稱或狀態" />
          <SearchButton type="button" />
        </div>
      </div>
      {filteredCompanies.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><h3 className="font-bold text-slate-800">找不到符合的公司</h3><p className="mt-2 text-sm text-slate-500">請調整搜尋關鍵字。</p></div> : <div className="overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th><SelectAllCheckbox /></th><th>公司代碼</th><th>SKU 前綴</th><th>公司名稱</th><th>狀態</th><th className="text-right">客戶數</th><th className="text-right">價格表數</th></tr></thead><tbody>{filteredCompanies.map((company) => <tr key={company.id}>
        <td><RowCheckbox id={company.id} label={company.name} /></td><td className="font-mono font-semibold text-teal-700">{company.code}</td><td className="font-mono">{company.skuPrefix}</td><td><button type="button" className="text-left font-semibold text-slate-800 hover:text-teal-700 hover:underline" onClick={() => { setSelectedId(company.id); setEditing(false); }}>{company.name}</button></td><td><span className="status-pill">{company.status === "ACTIVE" ? "啟用" : "停用"}</span></td><td className="text-right tabular-nums">{company.customerCount}</td><td className="text-right tabular-nums">{company.priceListCount}</td>
      </tr>)}</tbody></table></div>}
    </section></BulkDeleteForm>

    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="company-modal-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><p className="eyebrow">公司主檔</p><h2 id="company-modal-title" className="mt-1 text-xl font-bold text-slate-900">{creating ? "新增公司" : editing ? "編輯公司" : selected?.name}</h2></div><button type="button" className="flex size-9 items-center justify-center rounded-lg text-xl text-slate-500 hover:bg-slate-100" aria-label="關閉" onClick={closeModal}>×</button></div>
        <div className="p-6">
          {creating ? <CompanyForm onCancel={closeModal} /> : selected && editing ? <CompanyEditForm company={selected} onCancel={finishEditing} onSaved={finishEditing} /> : selected && <div className="space-y-6">
            <dl className="grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-400">公司代碼</dt><dd className="mt-1 font-mono font-semibold text-slate-800">{selected.code}</dd></div><div><dt className="text-xs font-semibold text-slate-400">SKU 前綴</dt><dd className="mt-1 font-mono font-semibold text-slate-800">{selected.skuPrefix}</dd></div><div><dt className="text-xs font-semibold text-slate-400">公司名稱</dt><dd className="mt-1 font-semibold text-slate-800">{selected.name}</dd></div><div><dt className="text-xs font-semibold text-slate-400">狀態</dt><dd className="mt-1 text-slate-700">{selected.status === "ACTIVE" ? "啟用" : "停用"}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-400">備註</dt><dd className="mt-1 min-h-6 whitespace-pre-wrap text-slate-700">{selected.note || "無"}</dd></div></dl>
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5"><DeleteRecordButton action={deleteCompanies} id={selected.id} name={selected.name} /><button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={closeModal}>關閉</button><button type="button" className="primary-button" onClick={() => setEditing(true)}>編輯</button></div>
          </div>}
        </div>
      </section>
    </div>}
  </>;
}
