import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { confirmPurchaseOrder, createGoodsReceiptFromPurchaseOrder } from "@/app/procurement-actions";
import { DetailField, DetailGrid, DetailSection, EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, formatQuantity, purchaseOrderStatusLabel } from "@/lib/procurement";

export default async function PurchaseOrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params; const { error, success } = await searchParams; const orderId = Number(id); if (!Number.isInteger(orderId)) notFound();
  const [order, warehouses] = await Promise.all([
    prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { company: true, supplier: true, lines: { include: { requisitionSources: { include: { requisitionLine: { include: { requisition: true } } } } }, orderBy: { lineNo: "asc" } }, goodsReceipts: { orderBy: { receiptDate: "desc" } } } }),
    prisma.warehouse.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } }),
  ]);
  if (!order) notFound(); const total = order.lines.reduce((sum, line) => sum + Number(line.totalAmount), 0);
  return <><PageHeader eyebrow="採購管理" title={order.number} backHref="/purchase-orders" /><FlashMessage error={error} success={success} />
    <DetailSection title="採購資訊" tone="violet"><DetailGrid><DetailField label="採購公司">{companyShortName(order.company)}</DetailField><DetailField label="狀態"><StatusPill>{purchaseOrderStatusLabel[order.status]}</StatusPill></DetailField><DetailField label="採購日期">{formatDate(order.orderDate)}</DetailField><DetailField label="預計交貨日">{formatDate(order.expectedDeliveryDate)}</DetailField><DetailField label="供應商">{order.supplierNameSnapshot}</DetailField><DetailField label="付款條件">{order.paymentTermsSnapshot}</DetailField><DetailField label="幣別／匯率">{order.currency}／{order.exchangeRate.toString()}</DetailField><DetailField label="總金額">{formatMoney(total, order.currency)}</DetailField><DetailField label="來源請購">{[...new Set(order.lines.flatMap((line) => line.requisitionSources.map((source) => source.requisitionLine.requisition.number)))].map((number) => <Link key={number} className="table-link mr-2" href={`/purchase-requisitions/${order.lines.flatMap((line) => line.requisitionSources).find((source) => source.requisitionLine.requisition.number === number)?.requisitionLine.requisition.id}`}>{number}</Link>)}</DetailField></DetailGrid></DetailSection>
    <DetailSection title="採購明細" tone="amber"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>項次</th><th>品號</th><th>品名／規格</th><th>採購數量</th><th>已進貨</th><th>未交</th><th>單價</th><th>金額</th></tr></thead><tbody>
      {order.lines.map((line) => { const outstanding = Number(line.orderedQuantity) - Number(line.receivedQuantity) - Number(line.cancelledQuantity); return <tr key={line.id}><td>{line.lineNo}</td><td>{line.itemCodeSnapshot}</td><td>{line.itemNameSnapshot}<div className="text-xs text-slate-500">{line.itemSpecSnapshot}</div></td><td>{formatQuantity(line.orderedQuantity)} {line.unitSnapshot}</td><td>{formatQuantity(line.receivedQuantity)}</td><td>{formatQuantity(outstanding)}</td><td>{formatMoney(line.unitPrice, order.currency)}</td><td>{formatMoney(line.totalAmount, order.currency)}</td></tr>; })}
      {order.lines.length === 0 ? <EmptyRow colSpan={8} /> : null}
    </tbody></table></div></DetailSection>
    <DetailSection title="流程操作"><div className="action-row">{order.status === "DRAFT" ? <form action={confirmPurchaseOrder.bind(null, order.id)}><button className="primary-button" type="submit">確認採購單</button></form> : null}
      {["CONFIRMED", "PARTIALLY_RECEIVED"].includes(order.status) ? <form action={createGoodsReceiptFromPurchaseOrder.bind(null, order.id)} className="inline-form"><label className="field-label">收貨倉庫 *<select className="field-input" name="warehouseId" required><option value="">請選擇</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} {warehouse.name}</option>)}</select></label><label className="field-label">收貨日期 *<input className="field-input" name="receiptDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label className="field-label">備註<input className="field-input" name="note" /></label><button className="primary-button" type="submit">建立進貨單</button></form> : null}
    </div></DetailSection>
    <DetailSection title="進貨紀錄" tone="blue"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>進貨單號</th><th>收貨日期</th><th>狀態</th></tr></thead><tbody>{order.goodsReceipts.map((receipt) => <tr key={receipt.id}><td><Link className="table-link" href={`/goods-receipts/${receipt.id}`}>{receipt.number}</Link></td><td>{formatDate(receipt.receiptDate)}</td><td>{receipt.status}</td></tr>)}{order.goodsReceipts.length === 0 ? <EmptyRow colSpan={3} /> : null}</tbody></table></div></DetailSection>
  </>;
}
