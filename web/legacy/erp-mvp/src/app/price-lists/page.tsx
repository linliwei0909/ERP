import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PriceListForm } from "./price-list-form";
import { PriceListItemForm } from "./price-list-item-form";
import { SearchButton } from "@/components/search-button";
import { BulkDeleteForm, DeleteRecordButton, RowCheckbox, SelectAllCheckbox } from "@/components/delete-controls";
import { deletePriceLists } from "./actions";

type PriceListsPageProps = {
  searchParams: Promise<{ q?: string; mode?: string; id?: string; detail?: string }>;
};

export default async function PriceListsPage({ searchParams }: PriceListsPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const selectedId = Number(params.id);
  const showNewPriceList = params.mode === "new";
  const showNewPriceDetail = params.detail === "new";
  const [companies, priceLists, items] = await Promise.all([
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } }),
    prisma.priceList.findMany({ include: { company: true, items: { include: { item: { include: { company: true } } }, orderBy: { item: { code: "asc" } } }, _count: { select: { customers: true } } }, orderBy: [{ company: { code: "asc" } }, { code: "asc" }] }),
    prisma.item.findMany({ where: { status: "ACTIVE" }, include: { company: true }, orderBy: [{ companyId: "asc" }, { code: "asc" }] }),
  ]);
  const filteredPriceLists = query
    ? priceLists.filter((priceList) => {
        const haystack = [
          priceList.code,
          priceList.name,
          priceList.company.name,
          priceList.currency,
          priceList.type === "SHARED" ? "共用" : "客戶專屬",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
    : priceLists;
  const selectedPriceList = priceLists.find((priceList) => priceList.id === selectedId) ?? null;
  const closeHref = query ? `/price-lists?q=${encodeURIComponent(query)}` : "/price-lists";

  return <div className="space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">銷售基礎資料</p><h1 className="page-title">價格表主檔</h1><p className="mt-2 text-sm text-slate-500">設定各公司可指派給客戶的價格表。</p></div><Link href="/price-lists?mode=new" className="primary-button">新增價格表</Link></header>
    <div className="grid gap-6">
      <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5"><div><h2 className="font-bold">價格表清單</h2><p className="mt-1 text-xs text-slate-500">共 {priceLists.length} 張</p></div><form className="flex min-w-64 gap-2"><input name="q" defaultValue={query} className="field-input mt-0" placeholder="搜尋代碼、名稱或公司" /><SearchButton /></form></div>
        <BulkDeleteForm key={priceLists.map((priceList) => priceList.id).join("-")} action={deletePriceLists} noun="價格表">{priceLists.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><h3 className="font-bold text-slate-800">尚未建立價格表</h3><p className="mt-2 text-sm text-slate-500">點選新增價格表建立第一張價格表。</p></div> : filteredPriceLists.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><h3 className="font-bold text-slate-800">找不到符合的價格表</h3><p className="mt-2 text-sm text-slate-500">請調整搜尋關鍵字。</p></div> : <div className="overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th><SelectAllCheckbox /></th><th>價格表代碼</th><th>價格表名稱</th><th>銷售公司</th><th>類型</th><th>幣別</th><th className="text-right">使用客戶</th><th className="text-right">品項數</th></tr></thead><tbody>{filteredPriceLists.map((priceList) => <tr key={priceList.id}><td><RowCheckbox id={priceList.id} label={priceList.name} /></td><td><Link href={`/price-lists?id=${priceList.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className="font-mono font-semibold text-teal-700 hover:underline">{priceList.code}</Link></td><td className="font-semibold text-slate-800">{priceList.name}</td><td>{companyShortName(priceList.company)}</td><td><span className="status-pill">{priceList.type === "SHARED" ? "共用" : "客戶專屬"}</span></td><td>{priceList.currency}</td><td className="text-right tabular-nums">{priceList._count.customers}</td><td className="text-right tabular-nums">{priceList.items.length}</td></tr>)}</tbody></table></div>}</BulkDeleteForm>
      </section>
    </div>
    {showNewPriceList && <div className="modal-backdrop" role="presentation"><section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="new-price-list-title"><header className="modal-header"><div><p className="eyebrow">新增畫面</p><h2 id="new-price-list-title" className="mt-1 text-2xl font-bold text-slate-900">新增價格表</h2></div><Link href="/price-lists" className="modal-close" aria-label="關閉新增價格表視窗">×</Link></header><div className="modal-body"><PriceListForm companies={companies.map(({ id, code, name }) => ({ id, code, name }))} /></div></section></div>}
    {selectedPriceList && <div className="modal-backdrop" role="presentation"><section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="price-list-detail-title"><header className="modal-header"><div><p className="eyebrow">價格表明細</p><h2 id="price-list-detail-title" className="mt-1 text-2xl font-bold text-slate-900">{selectedPriceList.name}</h2><p className="mt-1 font-mono text-xs text-teal-700">{selectedPriceList.code}</p></div><Link href={closeHref} className="modal-close" aria-label="關閉價格表明細">×</Link></header><div className="modal-body space-y-7">
      {!showNewPriceDetail && <><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-slate-400">銷售公司</dt><dd className="mt-1 text-slate-800">{companyShortName(selectedPriceList.company)}</dd></div><div><dt className="font-semibold text-slate-400">類型</dt><dd className="mt-1 text-slate-800">{selectedPriceList.type === "SHARED" ? "共用" : "客戶專屬"}</dd></div><div><dt className="font-semibold text-slate-400">幣別</dt><dd className="mt-1 text-slate-800">{selectedPriceList.currency}</dd></div><div><dt className="font-semibold text-slate-400">使用狀態</dt><dd className="mt-1 text-slate-800">{selectedPriceList._count.customers} 位客戶使用 · {selectedPriceList.items.length} 個品項</dd></div></dl><section><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">品項定價</p><h3 className="mt-1 text-xl font-bold text-slate-900">價格明細</h3><p className="mt-1 text-sm text-slate-500">價格表歸屬銷售公司，但可加入不同產品公司的品項。</p></div><Link href={`/price-lists?id=${selectedPriceList.id}&detail=new`} className="primary-button">新增價格明細</Link></div>{selectedPriceList.items.length === 0 ? <div className="mt-4 rounded-xl border border-slate-200 p-5 text-sm text-slate-500">尚未建立價格明細。</div> : <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="data-table min-w-[720px]"><thead><tr><th>產品公司</th><th>品號</th><th>品名／規格</th><th className="text-right">單價</th></tr></thead><tbody>{selectedPriceList.items.map((entry) => <tr key={entry.id}><td>{companyShortName(entry.item.company)}</td><td className="font-mono text-teal-700">{entry.item.code}</td><td>{entry.item.name}{entry.item.spec ? ` · ${entry.item.spec}` : ""}</td><td className="text-right font-semibold tabular-nums">{selectedPriceList.currency} {Number(entry.unitPrice).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td></tr>)}</tbody></table></div>}</section><div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5"><DeleteRecordButton action={deletePriceLists} id={selectedPriceList.id} name={selectedPriceList.name} /><Link href={closeHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">關閉</Link></div></>}
      {showNewPriceDetail && <section className="max-w-xl"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="eyebrow">品項定價</p><h3 className="mt-1 text-xl font-bold text-slate-900">新增價格明細</h3></div><Link href={`/price-lists?id=${selectedPriceList.id}`} className="text-sm font-semibold text-slate-500 hover:text-slate-900">取消</Link></div><PriceListItemForm priceLists={priceLists.filter((priceList) => priceList.status === "ACTIVE").map(({ id, companyId, code, name, currency }) => ({ id, companyId, code, name, currency }))} items={items.map(({ id, company, code, name, spec, unit }) => ({ id, companyName: companyShortName(company), code, name, spec, unit }))} /></section>}
    </div></section></div>}
  </div>;
}
