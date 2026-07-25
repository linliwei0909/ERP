import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listFreightRules } from "@/lib/freight/service";
import { toDateText } from "@/lib/freight/validation";
import { prisma } from "@/lib/prisma";
import { FreightRuleCreateClient } from "./freight-rule-create-client";

const modeLabels = {
  NO_CHARGE: "不收運費",
  QUANTITY_BASED: "按數量收費",
  FIXED_PER_LOCATION: "地點固定金額",
} as const;

export default async function AdminFreightRulesPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    customerId?: string;
    status?: string;
    page?: string;
  }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listFreightRules(prisma, { context, companyId, query });
    const customerRelations = await prisma.customerCompany.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          customer: { status: "ACTIVE" },
        },
        include: {
          customer: {
            include: {
              deliveryLocations: {
                where: { status: "ACTIVE" },
                orderBy: [{ code: "asc" }],
              },
            },
          },
        },
        orderBy: [{ normalizedCustomerCode: "asc" }],
      });
    data = { context, query, companyId, result, customerRelations };
  } catch {
    redirect("/");
  }
  const { context, query, companyId, result, customerRelations } = data;
  const locations = customerRelations.flatMap((relation) =>
    relation.customer.deliveryLocations.map((location) => ({
      id: location.id,
      customerId: relation.customerId,
      label: `${relation.customerCode}－${relation.customer.name}／${location.code}－${location.name}`,
    })),
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">P2.5 管理員功能</p>
          <h1 className="text-3xl font-bold">運費規則管理</h1>
        </div>
        <Link href="/" className="rounded-lg border px-4 py-2">
          返回首頁
        </Link>
      </div>
      <form className="mt-8 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-3">
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
        <select
          name="customerId"
          defaultValue={query.customerId ?? ""}
          className="rounded-lg border px-3 py-2"
        >
          <option value="">全部客戶</option>
          {customerRelations.map((relation) => (
            <option key={relation.customerId} value={relation.customerId}>
              {relation.customerCode}－{relation.customer.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={query.status ?? "ALL"}
          className="rounded-lg border px-3 py-2"
        >
          <option value="ALL">全部狀態</option>
          <option value="ACTIVE">有效</option>
          <option value="INACTIVE">停用</option>
        </select>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-white md:col-span-3 md:justify-self-start">
          查詢
        </button>
      </form>
      <FreightRuleCreateClient companyId={companyId} locations={locations} />
      <section className="mt-6 divide-y rounded-2xl border bg-white p-6">
        {result.items.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-semibold">
                {entry.customerCompany.customer.name}／
                {entry.deliveryLocation.code}－{entry.deliveryLocation.name}
              </p>
              <p className="text-sm text-slate-500">
                {modeLabels[entry.mode]}｜{toDateText(entry.validFrom)} ～{" "}
                {entry.validTo ? toDateText(entry.validTo) : "無期限"}｜
                {entry.status === "ACTIVE" ? "有效" : "停用"}
              </p>
            </div>
            <Link
              href={`/admin/freight-rules/${entry.id}?companyId=${companyId}`}
              className="rounded-lg border px-3 py-2"
            >
              管理
            </Link>
          </div>
        ))}
        {result.items.length === 0 ? (
          <p className="py-4 text-slate-500">查無資料。</p>
        ) : null}
      </section>
    </main>
  );
}
