import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { LinkButton, StatusBadge } from "@/components/ui";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getFreightRule } from "@/lib/freight/service";
import { toDateText } from "@/lib/freight/validation";
import { prisma } from "@/lib/prisma";
import { FreightRuleEditor } from "./freight-rule-editor";

export default async function FreightRuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const value = await getFreightRule(prisma, {
      context,
      companyId,
      freightRuleId: (await params).id,
    });
    data = { companyId, value };
  } catch {
    redirect("/admin/freight-rules");
  }
  const { companyId, value } = data;
  return (
    <div className={pageStyles.pageStack}>
      <PageHeader containerVariant="standard" context="運費規則明細" title={`${value.customerCompany.customer.name}／${value.deliveryLocation.name}`} description="已生效版本僅能調整期間或狀態；模式或金額異動請建立未來版本。" status={<StatusBadge label={value.status === "ACTIVE" ? "有效" : "停用"} tone={value.status === "ACTIVE" ? "success" : "neutral"} />} actions={<LinkButton href={`/admin/freight-rules?companyId=${companyId}`} variant="secondary">返回清單</LinkButton>} />
      <FreightRuleEditor
        companyId={companyId}
        value={{
          id: value.id,
          customerId: value.customerId,
          deliveryLocationId: value.deliveryLocationId,
          mode: value.mode,
          unitFreight: value.unitFreight?.toFixed(0) ?? null,
          fixedFreight: value.fixedFreight?.toFixed(0) ?? null,
          validFrom: toDateText(value.validFrom),
          validTo: value.validTo ? toDateText(value.validTo) : null,
          status: value.status,
        }}
      />
    </div>
  );
}
