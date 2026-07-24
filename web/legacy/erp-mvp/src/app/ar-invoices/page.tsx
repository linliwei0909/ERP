import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { arInvoiceStatusLabel, formatDate, formatMoney } from "@/lib/sales";
import { SearchButton } from "@/components/search-button";

export default async function ArInvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const rows = await prisma.arInvoice.findMany({ where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { customerCodeSnapshot: { contains: q, mode: "insensitive" } }, { customerNameSnapshot: { contains: q, mode: "insensitive" } }, { governmentInvoiceNumber: { contains: q, mode: "insensitive" } }] } : undefined, include: { company: true, salesDelivery: true }, orderBy: [{ invoiceDate: "desc" }, { id: "desc" }] });
  return <><PageHeader eyebrow="財務帳款" title="應收發票" description="應收只記錄客戶債務，不再次扣減庫存；可與政府統一發票狀態分開管理。" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋應收、客戶或統一發票號碼" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>應收單號</th><th>銷貨單</th><th>公司</th><th>日期</th><th>客戶</th><th>總金額</th><th>未收餘額</th><th>統一發票</th><th>狀態</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/ar-invoices/${row.id}`}>{row.number}</Link></td><td><Link className="table-link" href={`/sales-deliveries/${row.salesDeliveryId}`}>{row.salesDelivery.number}</Link></td><td>{companyShortName(row.company)}</td><td>{formatDate(row.invoiceDate)}</td><td>{row.customerCodeSnapshot} {row.customerNameSnapshot}</td><td>{formatMoney(row.totalAmount, row.currency)}</td><td>{formatMoney(row.remainingBalance, row.currency)}</td><td>{row.governmentInvoiceNumber ?? "未開立"}</td><td><StatusPill>{arInvoiceStatusLabel[row.status]}</StatusPill></td></tr>)}{rows.length === 0 ? <EmptyRow colSpan={9} /> : null}</tbody></table></div></>;
}
