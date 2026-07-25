import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { hasRole } from "@/lib/auth/rbac";
import { CompanyAccessError } from "@/lib/auth/company-scope";

export default async function Home() {
  let context;

  try {
    context = await getPageRequestContext();
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      redirect("/access-denied");
    }
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-teal-700">P1 技術基線</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          Ragic 本地端系統
        </h1>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-500">目前使用者</dt>
            <dd className="font-semibold">{context.actor.username}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">目前公司</dt>
            <dd className="font-semibold">
              {context.selectedCompany.name}
            </dd>
          </div>
        </dl>

        {context.authorizedCompanies.length > 1 ? (
          <form
            method="post"
            action="/api/auth/company"
            className="mt-6 flex items-end gap-3"
          >
            <label className="flex-1 text-sm font-medium text-slate-700">
              切換公司
              <select
                name="companyId"
                defaultValue={context.selectedCompany.id}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {context.authorizedCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.code}－{company.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-lg border border-slate-300 px-4 py-2">
              切換
            </button>
          </form>
        ) : null}

        <div className="mt-8 flex gap-3">
          <Link
            href="/customers"
            className="rounded-lg border border-teal-700 px-4 py-2 text-teal-800"
          >
            客戶查詢
          </Link>
          {hasRole(context.roleCodes, "ADMIN") ? (
            <>
              <Link
                href="/admin/users"
                className="rounded-lg bg-slate-900 px-4 py-2 text-white"
              >
                使用者管理
              </Link>
              <Link
                href="/admin/company-settings"
                className="rounded-lg bg-teal-700 px-4 py-2 text-white"
              >
                公司參數管理
              </Link>
              <Link
                href="/admin/customers"
                className="rounded-lg bg-blue-700 px-4 py-2 text-white"
              >
                客戶主檔管理
              </Link>
            </>
          ) : null}
          <form method="post" action="/api/auth/logout">
            <button className="rounded-lg border border-slate-300 px-4 py-2">
              登出
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
