import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listCustomers } from "@/lib/customers/service";
import { prisma } from "@/lib/prisma";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    search?: string;
    status?: string;
    page?: string;
  }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listCustomers(prisma, {
      context,
      companyId,
      query: {
        search: query.search ?? "",
        status: query.status ?? "ACTIVE",
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
      page: String(page),
    });
    return `/customers?${params.toString()}`;
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">P2.2</p>
          <h1 className="text-3xl font-bold">客戶查詢</h1>
        </div>
        <Link href="/" className="rounded-lg border px-4 py-2">
          返回首頁
        </Link>
      </div>

      <form className="mt-8 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-4">
        <label className="text-sm font-medium">
          公司
          <select
            name="companyId"
            defaultValue={companyId}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {context.authorizedCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code}－{company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium md:col-span-2">
          搜尋
          <input
            name="search"
            defaultValue={query.search}
            placeholder="客戶名稱、統編或公司客戶代碼"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <input type="hidden" name="status" value="ACTIVE" />
        <button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-white">
          查詢
        </button>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">公司客戶代碼</th>
              <th className="px-4 py-3">客戶名稱</th>
              <th className="px-4 py-3">類型</th>
              <th className="px-4 py-3">識別資料</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((customer) => (
              <tr key={customer.id} className="border-t">
                <td className="px-4 py-3">
                  {customer.companyRelations[0]?.customerCode ?? "—"}
                </td>
                <td className="px-4 py-3 font-medium">
                  <Link
                    className="text-teal-700 underline"
                    href={`/customers/${customer.id}?companyId=${companyId}`}
                  >
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {customer.customerType === "DOMESTIC" ? "境內" : "境外"}
                </td>
                <td className="px-4 py-3">
                  {customer.taxId ??
                    ([customer.countryCode, customer.foreignIdentifier]
                      .filter(Boolean)
                      .join(" / ") ||
                      "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">查無可使用客戶。</p>
        ) : null}
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
