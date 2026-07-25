import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getCustomer } from "@/lib/customers/service";
import { prisma } from "@/lib/prisma";
import { CustomerManagerClient } from "./customer-manager-client";

export default async function AdminCustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const companyId =
      (await searchParams).companyId ?? context.selectedCompany.id;
    const customer = await getCustomer(prisma, {
      context,
      companyId,
      customerId: (await params).id,
      includeInactive: true,
    });
    pageData = { context, companyId, customer };
  } catch {
    redirect("/admin/customers");
  }
  const { context, companyId, customer } = pageData;
  const serializedCustomer = JSON.parse(
    JSON.stringify(customer),
  ) as Parameters<typeof CustomerManagerClient>[0]["customer"];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">客戶主檔管理</p>
          <h1 className="text-3xl font-bold">{customer.name}</h1>
        </div>
        <Link
          href={`/admin/customers?companyId=${companyId}`}
          className="rounded-lg border px-4 py-2"
        >
          返回清單
        </Link>
      </div>
      <CustomerManagerClient
        customer={serializedCustomer}
        companies={context.authorizedCompanies}
        selectedCompanyId={companyId}
      />
    </main>
  );
}
