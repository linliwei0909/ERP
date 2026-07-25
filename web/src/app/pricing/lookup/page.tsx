import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listCustomers } from "@/lib/customers/service";
import { listSaleableItems } from "@/lib/items/service";
import { getEffectivePrice, PriceNotFoundError } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export default async function PriceLookupPage({ searchParams }: {
  searchParams: Promise<{ companyId?: string; customerId?: string; itemId?: string; effectiveDate?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const [customers, items] = await Promise.all([
      listCustomers(prisma, { context, companyId, query: { pageSize: 100 } }),
      listSaleableItems(prisma, { context, companyId, query: { pageSize: 100 } }),
    ]);
    let result = null;
    let notFound = false;
    if (query.customerId && query.itemId && query.effectiveDate) {
      try {
        result = await getEffectivePrice(prisma, {
          context, companyId, customerId: query.customerId, itemId: query.itemId, effectiveDate: query.effectiveDate,
        });
      } catch (error) {
        if (error instanceof PriceNotFoundError) notFound = true;
        else throw error;
      }
    }
    data = { context, query, companyId, customers, items, result, notFound };
  } catch { redirect("/"); }
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <div className="flex justify-between"><div><p className="text-sm font-semibold text-teal-700">P2.4</p><h1 className="text-3xl font-bold">正式價格查詢</h1></div><Link href="/" className="rounded-lg border px-4 py-2">返回首頁</Link></div>
      <form className="mt-8 grid gap-3 rounded-2xl border bg-white p-6 md:grid-cols-4">
        <select name="companyId" defaultValue={data.companyId} className="rounded-lg border px-3 py-2">{data.context.authorizedCompanies.map((company) => <option key={company.id} value={company.id}>{company.code}－{company.name}</option>)}</select>
        <select name="customerId" required defaultValue={data.query.customerId ?? ""} className="rounded-lg border px-3 py-2"><option value="" disabled>選擇客戶</option>{data.customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
        <select name="itemId" required defaultValue={data.query.itemId ?? ""} className="rounded-lg border px-3 py-2"><option value="" disabled>選擇品項</option>{data.items.items.map((item) => <option key={item.id} value={item.id}>{item.code}－{item.name}</option>)}</select>
        <input name="effectiveDate" required type="date" defaultValue={data.query.effectiveDate ?? ""} className="rounded-lg border px-3 py-2" />
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-white md:col-span-4 md:justify-self-start">查詢正式價格</button>
      </form>
      {data.result ? <section className="mt-6 rounded-2xl border bg-emerald-50 p-6"><p className="text-sm text-emerald-800">有效未稅單價</p><p className="mt-2 text-3xl font-bold">{data.result.unitPrice}</p><p className="mt-2 text-sm">有效期間：{data.result.validFrom} ～ {data.result.validTo ?? "無期限"}</p></section> : null}
      {data.notFound ? <p role="alert" className="mt-6 rounded-2xl border bg-amber-50 p-6 text-amber-900">PRICE_NOT_FOUND：指定條件找不到有效正式價格。</p> : null}
    </main>
  );
}
