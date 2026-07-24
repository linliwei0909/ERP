import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailField, DetailGrid, DetailSection, EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, receiptStatusLabel } from "@/lib/sales";

export default async function ReceiptDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params; const { error, success } = await searchParams;
  const receipt = await prisma.receipt.findUnique({ where: { id: Number(id) }, include: { company: true, customer: true, allocations: { include: { arInvoice: true }, orderBy: { allocatedAt: "asc" } } } });
  if (!receipt) notFound();
  return <><PageHeader eyebrow="財務帳款" title={`收款單 ${receipt.number}`} backHref="/receipts" /><FlashMessage error={error} success={success} />
    <DetailSection title="收款資訊" tone="teal"><DetailGrid><DetailField label="狀態"><StatusPill>{receiptStatusLabel[receipt.status]}</StatusPill></DetailField><DetailField label="收款日期">{formatDate(receipt.receiptDate)}</DetailField><DetailField label="公司">{companyShortName(receipt.company)}</DetailField><DetailField label="客戶">{receipt.customer.code} {receipt.customer.name}</DetailField><DetailField label="方式">{receipt.paymentMethod}</DetailField><DetailField label="總金額">{formatMoney(receipt.totalAmount, receipt.currency)}</DetailField><DetailField label="備註">{receipt.note ?? "—"}</DetailField><DetailField label="確認時間">{receipt.confirmedAt?.toLocaleString("zh-TW") ?? "—"}</DetailField></DetailGrid></DetailSection>
    <DetailSection title="沖帳明細" tone="teal"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>應收發票</th><th>客戶</th><th>發票總額</th><th>本次沖帳</th><th>未收餘額</th></tr></thead><tbody>{receipt.allocations.map((allocation) => <tr key={allocation.id}><td><Link className="table-link" href={`/ar-invoices/${allocation.arInvoiceId}`}>{allocation.arInvoice.number}</Link></td><td>{allocation.arInvoice.customerNameSnapshot}</td><td>{formatMoney(allocation.arInvoice.totalAmount, receipt.currency)}</td><td>{formatMoney(allocation.amount, receipt.currency)}</td><td>{formatMoney(allocation.arInvoice.remainingBalance, receipt.currency)}</td></tr>)}{receipt.allocations.length === 0 ? <EmptyRow colSpan={5} /> : null}</tbody></table></div></DetailSection>
  </>;
}
