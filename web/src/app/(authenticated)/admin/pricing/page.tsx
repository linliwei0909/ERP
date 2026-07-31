import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listPriceLists } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";
import { PriceListCreateClient } from "./price-list-create-client";

export default async function AdminPricingPage({ searchParams }: {
  searchParams: Promise<{ companyId?: string; search?: string; status?: string; page?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listPriceLists(prisma, { context, companyId, query });
    data = { context, query, companyId, result };
  } catch { redirect("/"); }
  const { context, query, companyId, result } = data;
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex justify-between">
        <div><p className="text-sm font-semibold text-teal-700">P2.4 管理員功能</p><h1 className="text-3xl font-bold">正式價格管理</h1></div>
        <Link href="/" className="rounded-lg border px-4 py-2">返回首頁</Link>
      </div>
      <form className="mt-8 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-4">
        <select name="companyId" defaultValue={companyId} className="rounded-lg border px-3 py-2">
          {context.authorizedCompanies.map((company) => <option key={company.id} value={company.id}>{company.code}－{company.name}</option>)}
        </select>
        <input name="search" defaultValue={query.search} placeholder="名稱或代碼" className="rounded-lg border px-3 py-2 md:col-span-2" />
        <select name="status" defaultValue={query.status ?? "ACTIVE"} className="rounded-lg border px-3 py-2">
          <option value="ACTIVE">有效</option><option value="INACTIVE">停用</option><option value="ALL">全部</option>
        </select>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-white md:col-span-4 md:justify-self-start">查詢</button>
      </form>
      <PriceListCreateClient companyId={companyId} />
      <section className="mt-6 divide-y rounded-2xl border bg-white p-6">
        {result.items.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between py-3">
            <div><p className="font-semibold">{entry.code}－{entry.name}</p><p className="text-sm text-slate-500">{entry.status === "ACTIVE" ? "有效" : "停用"}</p></div>
            <Link href={`/admin/pricing/${entry.id}?companyId=${companyId}`} className="rounded-lg border px-3 py-2">管理</Link>
          </div>
        ))}
        {result.items.length === 0 ? <p className="py-4 text-slate-500">查無資料。</p> : null}
      </section>
    </main>
  );
}
