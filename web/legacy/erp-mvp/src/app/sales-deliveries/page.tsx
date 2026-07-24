import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, salesDeliveryStatusLabel } from "@/lib/sales";
import { SearchButton } from "@/components/search-button";

export default async function SalesDeliveriesPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const rows = await prisma.salesDelivery.findMany({ where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { customerCodeSnapshot: { contains: q, mode: "insensitive" } }, { customerNameSnapshot: { contains: q, mode: "insensitive" } }, { salesOrder: { number: { contains: q, mode: "insensitive" } } }] } : undefined, include: { company: true, salesOrder: true, warehouse: true, arInvoice: true }, orderBy: [{ deliveryDate: "desc" }, { id: "desc" }] });
  return <><PageHeader eyebrow="銷售管理" title="銷貨／出庫" description="銷貨單完成出庫時才扣減指定批號庫存；已出庫後才能建立應收。" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋銷貨單、訂單或客戶" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>銷貨單</th><th>來源訂單</th><th>公司</th><th>日期</th><th>客戶</th><th>倉庫</th><th>應收</th><th>狀態</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/sales-deliveries/${row.id}`}>{row.number}</Link></td><td><Link className="table-link" href={`/sales-orders/${row.salesOrderId}`}>{row.salesOrder.number}</Link></td><td>{companyShortName(row.company)}</td><td>{formatDate(row.deliveryDate)}</td><td>{row.customerCodeSnapshot} {row.customerNameSnapshot}</td><td>{row.warehouse.name}</td><td>{row.arInvoice ? <Link className="table-link" href={`/ar-invoices/${row.arInvoice.id}`}>{row.arInvoice.number}</Link> : "—"}</td><td><StatusPill>{salesDeliveryStatusLabel[row.status]}</StatusPill></td></tr>)}{rows.length === 0 ? <EmptyRow colSpan={8} /> : null}</tbody></table></div></>;
}
