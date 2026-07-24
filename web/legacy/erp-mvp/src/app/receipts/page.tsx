import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, receiptStatusLabel } from "@/lib/sales";
import { SearchButton } from "@/components/search-button";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const rows = await prisma.receipt.findMany({ where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { code: { contains: q, mode: "insensitive" } } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : undefined, include: { company: true, customer: true, _count: { select: { allocations: true } } }, orderBy: [{ receiptDate: "desc" }, { id: "desc" }] });
  return <><PageHeader eyebrow="財務帳款" title="收款紀錄" description="每筆收款保留獨立單據及應收沖帳關聯。" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋收款單或客戶" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>收款單號</th><th>公司</th><th>日期</th><th>客戶</th><th>方式</th><th>金額</th><th>沖帳筆數</th><th>狀態</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/receipts/${row.id}`}>{row.number}</Link></td><td>{companyShortName(row.company)}</td><td>{formatDate(row.receiptDate)}</td><td>{row.customer.code} {row.customer.name}</td><td>{row.paymentMethod}</td><td>{formatMoney(row.totalAmount, row.currency)}</td><td>{row._count.allocations}</td><td><StatusPill>{receiptStatusLabel[row.status]}</StatusPill></td></tr>)}{rows.length === 0 ? <EmptyRow colSpan={8} /> : null}</tbody></table></div></>;
}
