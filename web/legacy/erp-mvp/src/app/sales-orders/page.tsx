import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, salesOrderStatusLabel } from "@/lib/sales";
import { SearchButton } from "@/components/search-button";
import { companyShortName } from "@/lib/company";

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const rows = await prisma.salesOrder.findMany({
    where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { customerCodeSnapshot: { contains: q, mode: "insensitive" } }, { customerNameSnapshot: { contains: q, mode: "insensitive" } }] } : undefined,
    include: { company: true, _count: { select: { lines: true, deliveries: true } } },
    orderBy: [{ orderDate: "desc" }, { id: "desc" }],
  });
  return <><PageHeader eyebrow="銷售管理" title="銷售訂單" description="訂單保存客戶、地址、價格與品項快照；確認訂單不會預留或扣減庫存。" actionHref="/sales-orders/new" actionLabel="新增銷售訂單" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋訂單、客戶代碼或名稱" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>訂單編號</th><th>公司</th><th>訂單日期</th><th>客戶</th><th>預計出貨</th><th>明細／銷貨</th><th>總金額</th><th>狀態</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/sales-orders/${row.id}`}>{row.number}</Link></td><td>{companyShortName(row.company)}</td><td>{formatDate(row.orderDate)}</td><td>{row.customerCodeSnapshot} {row.customerNameSnapshot}</td><td>{formatDate(row.expectedShipDate)}</td><td>{row._count.lines}／{row._count.deliveries}</td><td>{formatMoney(row.totalAmount, row.currency)}</td><td><StatusPill>{salesOrderStatusLabel[row.status]}</StatusPill></td></tr>)}
      {rows.length === 0 ? <EmptyRow colSpan={8} /> : null}
    </tbody></table></div></>;
}
