import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Button, Card, EmptyState, Field, LinkButton, Pagination, Section, Select, StatusBadge } from "@/components/ui";
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
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ companyId, customerId: query.customerId ?? "", status: query.status ?? "ALL", page: String(page) });
    return `/admin/freight-rules?${params.toString()}`;
  };

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader containerVariant="wide" context="管理員功能" title="運費規則管理" description="管理客戶送貨地點的運費模式與有效期間。" />
      <Card><form className={pageStyles.filterGrid}>
        <Field label="公司"><Select
          name="companyId"
          defaultValue={companyId}
        >
          {context.authorizedCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code}－{company.name}
            </option>
          ))}
        </Select></Field>
        <Field label="客戶"><Select
          name="customerId"
          defaultValue={query.customerId ?? ""}
        >
          <option value="">全部客戶</option>
          {customerRelations.map((relation) => (
            <option key={relation.customerId} value={relation.customerId}>
              {relation.customerCode}－{relation.customer.name}
            </option>
          ))}
        </Select></Field>
        <Field label="狀態"><Select
          name="status"
          defaultValue={query.status ?? "ALL"}
        >
          <option value="ALL">全部狀態</option>
          <option value="ACTIVE">有效</option>
          <option value="INACTIVE">停用</option>
        </Select></Field>
        <Button type="submit">查詢</Button>
      </form></Card>
      <FreightRuleCreateClient companyId={companyId} locations={locations} />
      <Card><Section title="運費規則清單" description={`共 ${result.pagination.total} 筆`}>
        {result.items.map((entry) => (
          <div key={entry.id} className={pageStyles.listRow}>
            <div>
              <p className="font-semibold">
                {entry.customerCompany.customer.name}／
                {entry.deliveryLocation.code}－{entry.deliveryLocation.name}
              </p>
              <div className={pageStyles.tableSubtext}>
                {modeLabels[entry.mode]}｜{toDateText(entry.validFrom)} ～{" "}
                {entry.validTo ? toDateText(entry.validTo) : "無期限"}｜
                <StatusBadge label={entry.status === "ACTIVE" ? "有效" : "停用"} tone={entry.status === "ACTIVE" ? "success" : "neutral"} />
              </div>
            </div>
            <LinkButton
              href={`/admin/freight-rules/${entry.id}?companyId=${companyId}`}
              variant="secondary" size="small"
            >
              管理
            </LinkButton>
          </div>
        ))}
        {result.items.length === 0 ? (
          <EmptyState variant="no-data" title="尚無運費規則" />
        ) : null}
      </Section></Card>
      <Pagination currentPage={result.pagination.page} totalPages={result.pagination.totalPages} previousHref={result.pagination.page > 1 ? pageHref(result.pagination.page - 1) : undefined} nextHref={result.pagination.page < result.pagination.totalPages ? pageHref(result.pagination.page + 1) : undefined} label="運費規則清單分頁" />
    </div>
  );
}
