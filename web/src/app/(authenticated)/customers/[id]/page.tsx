import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { hasRole } from "@/lib/auth/rbac";
import { getCustomer } from "@/lib/customers/service";
import { prisma } from "@/lib/prisma";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    const companyId =
      (await searchParams).companyId ?? context.selectedCompany.id;
    const customer = await getCustomer(prisma, {
      context,
      companyId,
      customerId: (await params).id,
      includeInactive: hasRole(context.roleCodes, "ADMIN"),
    });
    pageData = { context, companyId, customer };
  } catch {
    redirect("/customers");
  }
  const { context, companyId, customer } = pageData;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">客戶明細</p>
          <h1 className="text-3xl font-bold">{customer.name}</h1>
        </div>
        <div className="flex gap-2">
          {hasRole(context.roleCodes, "ADMIN") ? (
            <Link
              href={`/admin/customers/${customer.id}?companyId=${companyId}`}
              className="rounded-lg bg-slate-900 px-4 py-2 text-white"
            >
              管理客戶
            </Link>
          ) : null}
          <Link
            href={`/customers?companyId=${companyId}`}
            className="rounded-lg border px-4 py-2"
          >
            返回清單
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-3">
        <div><span className="text-sm text-slate-500">類型</span><p>{customer.customerType === "DOMESTIC" ? "境內" : "境外"}</p></div>
        <div><span className="text-sm text-slate-500">統一編號</span><p>{customer.taxId ?? "—"}</p></div>
        <div><span className="text-sm text-slate-500">境外識別</span><p>{[customer.countryCode, customer.foreignIdentifier].filter(Boolean).join(" / ") || "—"}</p></div>
        <div><span className="text-sm text-slate-500">狀態</span><p>{customer.status === "ACTIVE" ? "有效" : "停用"}</p></div>
        <div><span className="text-sm text-slate-500">目前公司客戶代碼</span><p>{customer.companyRelations.find((relation) => relation.companyId === companyId)?.customerCode ?? "—"}</p></div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">聯絡人</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {customer.contacts.map((contact) => (
            <article key={contact.id} className="rounded-xl border p-4">
              <div className="font-semibold">{contact.name}{contact.isPrimary ? "（主要）" : ""}</div>
              <div className="mt-1 text-sm text-slate-600">{[contact.department, contact.jobTitle].filter(Boolean).join("／") || "—"}</div>
              <div className="mt-2 text-sm">{[contact.phone, contact.mobile, contact.email].filter(Boolean).join("／")}</div>
            </article>
          ))}
          {customer.contacts.length === 0 ? <p className="text-sm text-slate-500">尚無有效聯絡人。</p> : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">送貨地點</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {customer.deliveryLocations.map((location) => (
            <article key={location.id} className="rounded-xl border p-4">
              <div className="font-semibold">{location.code}－{location.name}{location.isDefault ? "（預設）" : ""}</div>
              <div className="mt-1 text-sm">{location.fullAddress}</div>
              <div className="mt-2 text-sm text-slate-600">{location.recipientName}／{location.phone}</div>
            </article>
          ))}
          {customer.deliveryLocations.length === 0 ? <p className="text-sm text-slate-500">尚無有效送貨地點。</p> : null}
        </div>
      </section>
    </main>
  );
}
