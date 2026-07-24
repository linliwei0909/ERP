import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SearchButton } from "@/components/search-button";
import { ItemForm } from "./item-form";
import { ItemEditForm } from "./item-edit-form";
import { BulkDeleteForm, DeleteRecordButton, RowCheckbox, SelectAllCheckbox } from "@/components/delete-controls";
import { deleteItems } from "./actions";

const typeLabels: Record<string, string> = {
  FINISHED_GOOD: "成品",
  RAW_MATERIAL: "原物料",
  PACKAGING: "包材",
  CONSUMABLE: "耗材",
  OTHER: "其他",
};

type ItemsPageProps = {
  searchParams: Promise<{ q?: string; mode?: string; id?: string }>;
};

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const selectedId = Number(params.id);
  const showNew = params.mode === "new";
  const showEdit = params.mode === "edit";
  const [items, companies, categories, packageTypes] = await Promise.all([
    prisma.item.findMany({ include: { company: true, category: true, packageType: true }, orderBy: { createdAt: "desc" } }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } }),
    prisma.itemCategory.findMany({ where: { status: "ACTIVE" }, orderBy: [{ itemType: "asc" }, { code: "asc" }] }),
    prisma.packageType.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } }),
  ]);
  const nextSequences: Record<string, number> = {};
  for (const company of companies) for (const type of Object.keys(typeLabels)) {
    const scopedCategories = categories.filter((category) => category.itemType === type);
    const categoryIds = scopedCategories.length ? scopedCategories.map((category) => category.id) : [0];
    for (const categoryId of categoryIds) {
      const latest = items.filter((item) => item.companyId === company.id && item.type === type && (item.categoryId ?? 0) === categoryId).reduce((max, item) => Math.max(max, item.sequence), 0);
      nextSequences[`${company.id}:${type}:${categoryId}`] = latest + 1;
    }
  }
  const filteredItems = query
    ? items.filter((item) => {
        const haystack = [
          item.code,
          item.name,
          item.shortName,
          item.company.name,
          item.category?.name,
          item.category?.code,
          item.spec,
          item.packageType.name,
          typeLabels[item.type],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
    : items;
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const closeHref = query ? `/items?q=${encodeURIComponent(query)}` : "/items";
  const detailHref = selectedId ? `/items?id=${selectedId}${query ? `&q=${encodeURIComponent(query)}` : ""}` : closeHref;

  return (
    <div className="space-y-7">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">基礎資料</p>
          <h1 className="page-title">品項管理</h1>
          <p className="mt-2 text-sm text-slate-500">管理成品、原物料、包材與其他庫存品項。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/items?mode=new" className="primary-button">
            新增品項
          </Link>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
            共 {items.length} 筆
          </div>
        </div>
      </header>

      <div className="grid gap-6">
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="font-bold text-slate-900">品項清單</h2>
              <p className="mt-1 text-xs text-slate-500">依建立時間由新到舊排列</p>
            </div>
            <form className="flex min-w-64 gap-2">
              <input name="q" defaultValue={query} className="field-input mt-0" placeholder="搜尋品號、品名、公司或分類" />
              <SearchButton />
            </form>
          </div>

          <BulkDeleteForm key={items.map((item) => item.id).join("-")} action={deleteItems} noun="品項">{items.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-2xl">箱</div>
              <h3 className="font-bold text-slate-800">尚未建立品項</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                點選新增品項建立第一筆資料，之後即可進行批號入庫與庫存管理。
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <h3 className="font-bold text-slate-800">找不到符合的品項</h3>
              <p className="mt-2 text-sm text-slate-500">請調整搜尋關鍵字。</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1180px]">
                <thead>
                  <tr>
                    <th><SelectAllCheckbox /></th>
                    <th>品號</th>
                    <th>品名</th>
                    <th>產品公司</th>
                    <th>類型</th>
                    <th>分類</th>
                    <th>規格／包裝</th>
                    <th>追蹤</th>
                    <th className="text-right">安全庫存</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td><RowCheckbox id={item.id} label={item.name} /></td>
                      <td>
                        <Link href={`/items?id=${item.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className="font-mono font-semibold text-teal-700 hover:underline">
                          {item.code}
                        </Link>
                      </td>
                      <td className="font-semibold text-slate-800">{item.shortName || item.name}</td>
                      <td>{companyShortName(item.company)}</td>
                      <td><span className="status-pill">{typeLabels[item.type]}</span></td>
                      <td>{item.category ? `${item.category.code} · ${item.category.name}` : "不分類"}</td>
                      <td>{item.spec || "—"} / {item.packageType.name}</td>
                      <td className="text-slate-500">
                        {[item.trackLot && "批號", item.trackExpiry && "效期"]
                          .filter(Boolean)
                          .join("、") || "不追蹤"}
                      </td>
                      <td className="text-right font-semibold tabular-nums text-slate-700">
                        {item.safetyStock.toString()} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}</BulkDeleteForm>
        </section>

      </div>
      {showNew && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="new-item-title">
            <header className="modal-header">
              <div>
                <p className="eyebrow">新增畫面</p>
                <h2 id="new-item-title" className="mt-1 text-2xl font-bold text-slate-900">新增品項</h2>
              </div>
              <Link href="/items" className="modal-close" aria-label="關閉新增品項視窗">×</Link>
            </header>
            <div className="modal-body">
              <ItemForm companies={companies.map(({ id, code, name, skuPrefix }) => ({ id, code, name, skuPrefix }))} categories={categories.map(({ id, code, name, itemType }) => ({ id, code, name, itemType }))} packageTypes={packageTypes.map(({ id, code, name }) => ({ id, code, name }))} nextSequences={nextSequences} />
            </div>
          </section>
        </div>
      )}
      {selectedItem && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="item-detail-title">
            <header className="modal-header">
              <div>
                <p className="eyebrow">品項明細</p>
                <h2 id="item-detail-title" className="mt-1 text-2xl font-bold text-slate-900">{selectedItem.shortName || selectedItem.name}</h2>
                <p className="mt-1 font-mono text-xs text-teal-700">{selectedItem.code}</p>
              </div>
              <Link href={closeHref} className="modal-close" aria-label="關閉品項明細">×</Link>
            </header>
            <div className="modal-body space-y-6">
              {showEdit ? <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold">資料歸屬：</span>{companyShortName(selectedItem.company)} · {typeLabels[selectedItem.type]} · {selectedItem.category ? selectedItem.category.name : "不分類"}
                </div>
                <ItemEditForm item={{ id: selectedItem.id, code: selectedItem.code, name: selectedItem.name, shortName: selectedItem.shortName, spec: selectedItem.spec, packageTypeId: selectedItem.packageTypeId, barcode: selectedItem.barcode, safetyStock: selectedItem.safetyStock.toString(), status: selectedItem.status, trackLot: selectedItem.trackLot, trackExpiry: selectedItem.trackExpiry }} packageTypes={packageTypes.map(({ id, code, name }) => ({ id, code, name }))} cancelHref={detailHref} />
              </> : <>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="font-semibold text-slate-400">公司</dt><dd className="mt-1 text-slate-800">{companyShortName(selectedItem.company)}</dd></div>
                <div><dt className="font-semibold text-slate-400">類型</dt><dd className="mt-1 text-slate-800">{typeLabels[selectedItem.type]}</dd></div>
                <div><dt className="font-semibold text-slate-400">分類</dt><dd className="mt-1 text-slate-800">{selectedItem.category ? `${selectedItem.category.code} · ${selectedItem.category.name}` : "不分類"}</dd></div>
                <div><dt className="font-semibold text-slate-400">規格／包裝</dt><dd className="mt-1 text-slate-800">{selectedItem.spec || "—"} / {selectedItem.packageType.name}</dd></div>
                <div><dt className="font-semibold text-slate-400">狀態</dt><dd className="mt-1 text-slate-800">{selectedItem.status === "ACTIVE" ? "啟用" : "停用"}</dd></div>
                <div><dt className="font-semibold text-slate-400">條碼</dt><dd className="mt-1 text-slate-800">{selectedItem.barcode || "無"}</dd></div>
                <div><dt className="font-semibold text-slate-400">追蹤</dt><dd className="mt-1 text-slate-800">{[selectedItem.trackLot && "批號", selectedItem.trackExpiry && "效期"].filter(Boolean).join("、") || "不追蹤"}</dd></div>
                <div><dt className="font-semibold text-slate-400">安全庫存</dt><dd className="mt-1 text-slate-800">{selectedItem.safetyStock.toString()} {selectedItem.unit}</dd></div>
                <div className="sm:col-span-2"><dt className="font-semibold text-slate-400">正式品名</dt><dd className="mt-1 text-slate-800">{selectedItem.name}</dd></div>
              </dl>
              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5"><DeleteRecordButton action={deleteItems} id={selectedItem.id} name={selectedItem.name} /><Link href={closeHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">關閉</Link><Link href={`/items?id=${selectedItem.id}&mode=edit${query ? `&q=${encodeURIComponent(query)}` : ""}`} className="primary-button">編輯</Link></div>
              </>}
            </div>
          </section>
        </div>
      )}
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5"><p className="eyebrow">共用基礎資料</p><h2 className="mt-1 font-bold text-slate-900">品項分類</h2><p className="mt-1 text-xs text-slate-500">分類跨公司共用；包材、耗材與其他目前不分類。</p></div>
        <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
          {(["FINISHED_GOOD", "RAW_MATERIAL"] as const).map((itemType) => <div key={itemType} className="p-6"><h3 className="text-sm font-bold text-slate-700">{itemType === "FINISHED_GOOD" ? "產品分類" : "原物料分類"}</h3><div className="mt-4 flex flex-wrap gap-2">{categories.filter((category) => category.itemType === itemType).map((category) => <span key={category.id} className="status-pill"><span className="font-mono text-teal-700">{category.code}</span> · {category.name}</span>)}</div></div>)}
        </div>
      </section>
    </div>
  );
}
