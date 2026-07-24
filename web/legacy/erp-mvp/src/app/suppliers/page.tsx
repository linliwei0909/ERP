import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { SearchButton } from "@/components/search-button";
import { companyShortName } from "@/lib/company";

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const suppliers = await prisma.supplier.findMany({
    where: q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { taxId: { contains: q } }] } : undefined,
    include: { companies: { include: { company: true } }, _count: { select: { items: true, purchaseOrders: true } } },
    orderBy: { code: "asc" },
  });
  return (
    <>
      <PageHeader eyebrow="採購管理" title="供應商" description="跨公司共用供應商主檔；公司交易關係控制各公司可使用範圍。" actionHref="/suppliers/new" actionLabel="新增供應商" />
      <FlashMessage error={error} success={success} />
      <form className="panel mb-5 flex gap-2 p-3">
        <input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋代碼、名稱或統編" />
        <SearchButton />
      </form>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>供應商代碼</th><th>供應商名稱</th><th>統一編號</th><th>可用公司</th><th>供貨品項</th><th>採購單</th><th>狀態</th></tr></thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td><Link className="table-link" href={`/suppliers/${supplier.id}`}>{supplier.code}</Link></td>
                <td>{supplier.name}</td><td>{supplier.taxId ?? "—"}</td>
                <td>{supplier.companies.map((relation) => companyShortName(relation.company)).join("、")}</td>
                <td>{supplier._count.items}</td><td>{supplier._count.purchaseOrders}</td>
                <td><StatusPill>{supplier.status === "ACTIVE" ? "啟用" : "停用"}</StatusPill></td>
              </tr>
            ))}
            {suppliers.length === 0 ? <EmptyRow colSpan={7} /> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
