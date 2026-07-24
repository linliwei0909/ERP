import { companyShortName } from "@/lib/company";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addPurchaseRequisitionLine, approvePurchaseRequisition, createPurchaseOrderFromRequisition, submitPurchaseRequisition } from "@/app/procurement-actions";
import { DetailField, DetailGrid, DetailSection, EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, formatQuantity, requisitionStatusLabel } from "@/lib/procurement";

export default async function PurchaseRequisitionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params; const { error, success } = await searchParams; const requisitionId = Number(id); if (!Number.isInteger(requisitionId)) notFound();
  const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId }, include: { company: true, lines: { include: { suggestedSupplier: true }, orderBy: { lineNo: "asc" } } } });
  if (!requisition) notFound();
  const [items, suppliers] = await Promise.all([
    prisma.item.findMany({ where: { companyId: requisition.companyId, status: "ACTIVE" }, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { status: "ACTIVE", companies: { some: { companyId: requisition.companyId, status: "ACTIVE" } } }, orderBy: { code: "asc" } }),
  ]);
  return <><PageHeader eyebrow="採購管理" title={requisition.number} backHref="/purchase-requisitions" /><FlashMessage error={error} success={success} />
    <DetailSection title="請購資訊" tone="violet"><DetailGrid><DetailField label="公司">{companyShortName(requisition.company)}</DetailField><DetailField label="狀態"><StatusPill>{requisitionStatusLabel[requisition.status]}</StatusPill></DetailField><DetailField label="申請日期">{formatDate(requisition.requestDate)}</DetailField><DetailField label="需求日期">{formatDate(requisition.requiredDate)}</DetailField><DetailField label="申請人／部門">{[requisition.requester, requisition.department].filter(Boolean).join("／")}</DetailField><DetailField label="用途">{requisition.purpose}</DetailField></DetailGrid></DetailSection>
    <DetailSection title="請購明細" tone="amber"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>項次</th><th>品號</th><th>品名</th><th>規格</th><th>需求數量</th><th>已轉採購</th><th>預估單價</th><th>建議供應商</th></tr></thead><tbody>
      {requisition.lines.map((line) => <tr key={line.id}><td>{line.lineNo}</td><td>{line.itemCodeSnapshot}</td><td>{line.itemNameSnapshot}</td><td>{line.itemSpecSnapshot ?? "—"}</td><td>{formatQuantity(line.requestedQuantity)} {line.unitSnapshot}</td><td>{formatQuantity(line.orderedQuantity)}</td><td>{line.estimatedUnitPrice ? formatMoney(line.estimatedUnitPrice) : "—"}</td><td>{line.suggestedSupplier?.name ?? "—"}</td></tr>)}
      {requisition.lines.length === 0 ? <EmptyRow colSpan={8} /> : null}
    </tbody></table></div>
    {requisition.status === "DRAFT" ? <form action={addPurchaseRequisitionLine.bind(null, requisition.id)} className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-4">
      <label className="field-label md:col-span-2">品項 *<select className="field-input" name="itemId" required><option value="">請選擇</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code}｜{item.name}｜{item.spec}</option>)}</select></label><label className="field-label">數量 *<input className="field-input" name="requestedQuantity" type="number" min="0.001" step="0.001" required /></label>
      <label className="field-label">預估單價<input className="field-input" name="estimatedUnitPrice" type="number" min="0" step="0.0001" defaultValue="0" /></label><label className="field-label">建議供應商<select className="field-input" name="suggestedSupplierId"><option value="">未指定</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} {supplier.name}</option>)}</select></label>
      <label className="field-label">需求日期<input className="field-input" name="requiredDate" type="date" /></label><label className="field-label">用途<input className="field-input" name="purpose" /></label><label className="field-label">備註<input className="field-input" name="note" /></label><button className="primary-button self-end" type="submit">新增明細</button>
    </form> : null}</DetailSection>
    <DetailSection title="流程操作"><div className="action-row">
      {requisition.status === "DRAFT" ? <form action={submitPurchaseRequisition.bind(null, requisition.id)}><button className="primary-button" type="submit">送出核准</button></form> : null}
      {requisition.status === "PENDING_APPROVAL" ? <form action={approvePurchaseRequisition.bind(null, requisition.id)}><button className="primary-button" type="submit">核准請購單</button></form> : null}
      {["APPROVED", "PARTIALLY_ORDERED"].includes(requisition.status) ? <form action={createPurchaseOrderFromRequisition.bind(null, requisition.id)} className="inline-form"><label className="field-label">供應商 *<select className="field-input" name="supplierId" required><option value="">請選擇</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} {supplier.name}</option>)}</select></label><label className="field-label">採購日期 *<input className="field-input" name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label className="field-label">預計交貨日<input className="field-input" name="expectedDeliveryDate" type="date" /></label><button className="primary-button" type="submit">轉採購單</button></form> : null}
    </div></DetailSection>
    <DetailSection title="系統資訊"><DetailGrid><DetailField label="建立時間">{requisition.createdAt.toLocaleString("zh-TW")}</DetailField><DetailField label="最後修改">{requisition.updatedAt.toLocaleString("zh-TW")}</DetailField><DetailField label="核准資訊">{requisition.approvedAt ? `${requisition.approvedBy}／${requisition.approvedAt.toLocaleString("zh-TW")}` : "—"}</DetailField><DetailField label="備註">{requisition.note}</DetailField></DetailGrid></DetailSection>
  </>;
}
