import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { LinkButton, StatusBadge } from "@/components/ui";
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
    <div className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="客戶主檔管理"
        title={customer.name}
        description="維護客戶基本資料、公司授權、聯絡人與送貨地點。"
        status={<StatusBadge label={customer.status === "ACTIVE" ? "有效" : "停用"} tone={customer.status === "ACTIVE" ? "success" : "neutral"} />}
        actions={<LinkButton
          variant="secondary"
          href={`/admin/customers?companyId=${companyId}`}
        >
          返回清單
        </LinkButton>}
      />
      <CustomerManagerClient
        customer={serializedCustomer}
        companies={context.authorizedCompanies}
        selectedCompanyId={companyId}
      />
    </div>
  );
}
