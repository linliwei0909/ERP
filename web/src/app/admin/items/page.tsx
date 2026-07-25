import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listItems } from "@/lib/items/service";
import { prisma } from "@/lib/prisma";
import { ItemCreateClient } from "./item-create-client";

export default async function AdminItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    search?: string;
    status?: string;
    itemType?: string;
    page?: string;
  }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listItems(prisma, {
      context,
      companyId,
      query: {
        search: query.search ?? "",
        status: query.status ?? "ACTIVE",
        itemType: query.itemType ?? "ALL",
        availability: "ALL",
        page: query.page ?? "1",
        pageSize: "20",
      },
    });
    pageData = { context, query, companyId, result };
  } catch {
    redirect("/");
  }
  const { context, query, companyId, result } = pageData;
  const pageHref = (page: number) => {
    const params = new URLSearchParams({
      companyId,
      search: query.search ?? "",
      status: query.status ?? "ACTIVE",
      itemType: query.itemType ?? "ALL",
      page: String(page),
    });
    return `/admin/items?${params.toString()}`;
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">P2.3 管理員功能</p>
          <h1 className="text-3xl font-bold">品項主檔管理</h1>
        </div>
        <Link href="/" className="rounded-lg border px-4 py-2">
          返回首頁
        </Link>
      </div>

      <form className="mt-8 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-5">
        <select
          name="companyId"
          defaultValue={companyId}
          className="rounded-lg border px-3 py-2"
        >
          {context.authorizedCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code}－{company.name}
            </option>
          ))}
        </select>
        <input
          name="search"
          defaultValue={query.search}
          placeholder="名稱、代碼或條碼"
          className="rounded-lg border px-3 py-2 md:col-span-2"
        />
        <select
          name="itemType"
          defaultValue={query.itemType ?? "ALL"}
          className="rounded-lg border px-3 py-2"
        >
          <option value="ALL">全部類型</option>
          <option value="PRODUCT">產品</option>
          <option value="RAW_MATERIAL">原物料</option>
        </select>
        <select
          name="status"
          defaultValue={query.status ?? "ACTIVE"}
          className="rounded-lg border px-3 py-2"
        >
          <option value="ACTIVE">有效</option>
          <option value="INACTIVE">停用</option>
          <option value="ALL">全部</option>
        </select>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-white md:col-span-5 md:justify-self-start">
          搜尋
        </button>
      </form>

      <ItemCreateClient selectedCompanyId={companyId} />

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">品項清單</h2>
        <div className="mt-4 divide-y">
          {result.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <div className="font-semibold">
                  {item.companyRelations[0]?.companyItemCode}－{item.name}
                </div>
                <div className="text-sm text-slate-500">
                  {item.code}／
                  {item.itemType === "PRODUCT" ? "產品" : "原物料"}／
                  {item.status === "ACTIVE" ? "有效" : "停用"}
                </div>
              </div>
              <Link
                className="rounded-lg border px-3 py-2 text-sm"
                href={`/admin/items/${item.id}?companyId=${companyId}`}
              >
                管理
              </Link>
            </div>
          ))}
          {result.items.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">查無資料。</p>
          ) : null}
        </div>
      </section>

      <nav className="mt-5 flex items-center justify-between text-sm">
        <Link
          aria-disabled={result.pagination.page <= 1}
          className={
            result.pagination.page <= 1
              ? "pointer-events-none text-slate-300"
              : "underline"
          }
          href={pageHref(Math.max(1, result.pagination.page - 1))}
        >
          上一頁
        </Link>
        <span>
          第 {result.pagination.page} / {result.pagination.totalPages} 頁，共{" "}
          {result.pagination.total} 筆
        </span>
        <Link
          aria-disabled={
            result.pagination.page >= result.pagination.totalPages
          }
          className={
            result.pagination.page >= result.pagination.totalPages
              ? "pointer-events-none text-slate-300"
              : "underline"
          }
          href={pageHref(
            Math.min(
              result.pagination.totalPages,
              result.pagination.page + 1,
            ),
          )}
        >
          下一頁
        </Link>
      </nav>
    </main>
  );
}
