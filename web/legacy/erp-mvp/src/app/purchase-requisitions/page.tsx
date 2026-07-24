import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, requisitionStatusLabel } from "@/lib/procurement";
import { SearchButton } from "@/components/search-button";

export default async function PurchaseRequisitionsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const requisitions = await prisma.purchaseRequisition.findMany({
    where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { requester: { contains: q, mode: "insensitive" } }, { purpose: { contains: q, mode: "insensitive" } }] } : undefined,
    include: { company: true, _count: { select: { lines: true } } }, orderBy: [{ requestDate: "desc" }, { id: "desc" }],
  });
  return <><PageHeader eyebrow="採購管理" title="請購單" description="請購只記錄內部需求，不會直接增加庫存或產生應付。" actionHref="/purchase-requisitions/new" actionLabel="新增請購單" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋單號、申請人或用途" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>請購單號</th><th>公司</th><th>申請日期</th><th>需求日期</th><th>申請人</th><th>用途</th><th>明細</th><th>狀態</th></tr></thead><tbody>
      {requisitions.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/purchase-requisitions/${row.id}`}>{row.number}</Link></td><td>{companyShortName(row.company)}</td><td>{formatDate(row.requestDate)}</td><td>{formatDate(row.requiredDate)}</td><td>{row.requester ?? "—"}</td><td>{row.purpose ?? "—"}</td><td>{row._count.lines}</td><td><StatusPill>{requisitionStatusLabel[row.status]}</StatusPill></td></tr>)}
      {requisitions.length === 0 ? <EmptyRow colSpan={8} /> : null}
    </tbody></table></div></>;
}
