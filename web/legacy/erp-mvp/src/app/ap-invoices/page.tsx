import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { apInvoiceStatusLabel, formatDate, formatMoney } from "@/lib/procurement";
import { SearchButton } from "@/components/search-button";

export default async function ApInvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const invoices = await prisma.apInvoice.findMany({ where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplierNameSnapshot: { contains: q, mode: "insensitive" } }, { supplierInvoiceNumber: { contains: q, mode: "insensitive" } }] } : undefined, include: { company: true }, orderBy: [{ invoiceDate: "desc" }, { id: "desc" }] });
  return <><PageHeader eyebrow="財務帳款" title="應付發票" description="採購進貨與人工費用都在此立帳；建立應付不會增加庫存。" actionHref="/ap-invoices/new" actionLabel="新增人工應付" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋應付單、廠商發票或供應商" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>應付單號</th><th>公司</th><th>供應商</th><th>廠商發票</th><th>開立日期</th><th>應付日期</th><th>總金額</th><th>未付餘額</th><th>狀態</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><Link className="table-link" href={`/ap-invoices/${invoice.id}`}>{invoice.number}</Link></td><td>{companyShortName(invoice.company)}</td><td>{invoice.supplierNameSnapshot}</td><td>{invoice.supplierInvoiceNumber ?? "—"}</td><td>{formatDate(invoice.invoiceDate)}</td><td>{formatDate(invoice.dueDate)}</td><td>{formatMoney(invoice.totalAmount, invoice.currency)}</td><td>{formatMoney(invoice.remainingBalance, invoice.currency)}</td><td><StatusPill>{apInvoiceStatusLabel[invoice.status]}</StatusPill></td></tr>)}{invoices.length === 0 ? <EmptyRow colSpan={9} /> : null}</tbody></table></div></>;
}
