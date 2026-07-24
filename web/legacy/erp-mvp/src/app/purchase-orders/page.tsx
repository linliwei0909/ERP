import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, purchaseOrderStatusLabel } from "@/lib/procurement";
import { SearchButton } from "@/components/search-button";

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const orders = await prisma.purchaseOrder.findMany({
    where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplierNameSnapshot: { contains: q, mode: "insensitive" } }] } : undefined,
    include: { company: true, lines: true }, orderBy: [{ orderDate: "desc" }, { id: "desc" }],
  });
  return <><PageHeader eyebrow="採購管理" title="採購單" description="採購單由已核准請購單建立；確認採購本身不會增加庫存或產生應付。" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋採購單號或供應商" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>採購單號</th><th>公司</th><th>供應商</th><th>採購日期</th><th>預計交貨</th><th>總金額</th><th>狀態</th></tr></thead><tbody>
      {orders.map((order) => <tr key={order.id}><td><Link className="table-link" href={`/purchase-orders/${order.id}`}>{order.number}</Link></td><td>{companyShortName(order.company)}</td><td>{order.supplierNameSnapshot}</td><td>{formatDate(order.orderDate)}</td><td>{formatDate(order.expectedDeliveryDate)}</td><td>{formatMoney(order.lines.reduce((sum, line) => sum + Number(line.totalAmount), 0), order.currency)}</td><td><StatusPill>{purchaseOrderStatusLabel[order.status]}</StatusPill></td></tr>)}
      {orders.length === 0 ? <EmptyRow colSpan={7} /> : null}
    </tbody></table></div></>;
}
