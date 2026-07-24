import { companyShortName } from "@/lib/company";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addSupplierItem } from "@/app/procurement-actions";
import { DetailField, DetailGrid, DetailSection, EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney } from "@/lib/procurement";

export default async function SupplierDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params; const { error, success } = await searchParams;
  const supplierId = Number(id); if (!Number.isInteger(supplierId)) notFound();
  const [supplier, items] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      include: { companies: { include: { company: true } }, items: { include: { item: { include: { company: true } }, prices: { orderBy: { effectiveFrom: "desc" } } }, orderBy: { item: { code: "asc" } } } },
    }),
    prisma.item.findMany({ where: { status: "ACTIVE" }, include: { company: true }, orderBy: [{ companyId: "asc" }, { code: "asc" }] }),
  ]);
  if (!supplier) notFound();
  const allowedCompanyIds = new Set(supplier.companies.filter((relation) => relation.status === "ACTIVE").map((relation) => relation.companyId));
  const availableItems = items.filter((item) => allowedCompanyIds.has(item.companyId) && !supplier.items.some((relation) => relation.itemId === item.id));
  return (
    <>
      <PageHeader eyebrow="採購管理" title={`${supplier.code} ${supplier.name}`} backHref="/suppliers" />
      <FlashMessage error={error} success={success} />
      <DetailSection title="供應商資訊" tone="violet"><DetailGrid>
        <DetailField label="供應商代碼">{supplier.code}</DetailField><DetailField label="狀態"><StatusPill>{supplier.status === "ACTIVE" ? "啟用" : "停用"}</StatusPill></DetailField>
        <DetailField label="統一編號">{supplier.taxId}</DetailField><DetailField label="主要聯絡人">{supplier.contactName}</DetailField><DetailField label="電話">{supplier.phone}</DetailField><DetailField label="Email">{supplier.email}</DetailField>
        <DetailField label="地址">{supplier.address}</DetailField><DetailField label="可用公司">{supplier.companies.map((relation) => companyShortName(relation.company)).join("、")}</DetailField><DetailField label="Ragic 舊代碼">{supplier.legacyCode}</DetailField>
      </DetailGrid></DetailSection>
      <DetailSection title="供貨品項" tone="amber">
        <div className="data-table-wrap mb-5"><table className="data-table"><thead><tr><th>品號</th><th>品名</th><th>供應商料號</th><th>採購單位</th><th>換算率</th><th>最新價格</th></tr></thead><tbody>
          {supplier.items.map((relation) => <tr key={relation.id}><td>{relation.item.code}</td><td>{relation.item.name}</td><td>{relation.supplierItemCode ?? "—"}</td><td>{relation.purchaseUnit}</td><td>{relation.conversionRate.toString()}</td><td>{relation.prices[0] ? `${formatMoney(relation.prices[0].unitPrice, relation.prices[0].currency)}（${formatDate(relation.prices[0].effectiveFrom)}）` : "—"}</td></tr>)}
          {supplier.items.length === 0 ? <EmptyRow colSpan={6} /> : null}
        </tbody></table></div>
        <form action={addSupplierItem.bind(null, supplier.id)} className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-4">
          <label className="field-label">品項 *<select className="field-input" name="itemId" required><option value="">請選擇</option>{availableItems.map((item) => <option key={item.id} value={item.id}>{companyShortName(item.company)}｜{item.code}｜{item.name}</option>)}</select></label>
          <label className="field-label">供應商料號<input className="field-input" name="supplierItemCode" /></label><label className="field-label">採購單位 *<input className="field-input" name="purchaseUnit" required /></label>
          <label className="field-label">換算率 *<input className="field-input" name="conversionRate" type="number" min="0.000001" step="0.000001" defaultValue="1" required /></label><label className="field-label">最低採購量<input className="field-input" name="minimumOrderQuantity" type="number" min="0" step="0.001" defaultValue="0" /></label>
          <label className="field-label">交期（天）<input className="field-input" name="leadTimeDays" type="number" min="0" /></label><label className="field-label">單價 *<input className="field-input" name="unitPrice" type="number" min="0" step="0.0001" defaultValue="0" required /></label>
          <label className="field-label">生效日 *<input className="field-input" name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><button className="primary-button self-end" type="submit">新增供貨資料</button>
        </form>
      </DetailSection>
      <DetailSection title="系統資訊"><DetailGrid><DetailField label="建立時間">{supplier.createdAt.toLocaleString("zh-TW")}</DetailField><DetailField label="最後修改">{supplier.updatedAt.toLocaleString("zh-TW")}</DetailField><DetailField label="備註">{supplier.note}</DetailField></DetailGrid></DetailSection>
    </>
  );
}
