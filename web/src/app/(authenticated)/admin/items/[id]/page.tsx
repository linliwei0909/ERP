import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { LinkButton, StatusBadge } from "@/components/ui";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getItem } from "@/lib/items/service";
import { prisma } from "@/lib/prisma";
import {
  ItemManagerClient,
  type ManagedItem,
} from "./item-manager-client";

export default async function AdminItemDetailPage({
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
    const item = await getItem(prisma, {
      context,
      companyId,
      itemId: (await params).id,
      includeInactive: true,
    });
    pageData = { context, companyId, item };
  } catch {
    redirect("/admin/items");
  }
  const { context, companyId, item } = pageData;
  const serializedItem = JSON.parse(JSON.stringify(item)) as ManagedItem;

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="standard"
        context="品項主檔管理"
        title={item.name}
        description="維護品項基本資料、狀態與公司授權。"
        status={
          <StatusBadge
            label={item.status === "ACTIVE" ? "有效" : "停用"}
            tone={item.status === "ACTIVE" ? "success" : "neutral"}
          />
        }
        actions={
          <LinkButton
            href={`/admin/items?companyId=${companyId}`}
            variant="secondary"
          >
            返回清單
          </LinkButton>
        }
      />
      <ItemManagerClient
        item={serializedItem}
        companies={context.authorizedCompanies}
        selectedCompanyId={companyId}
      />
    </div>
  );
}
