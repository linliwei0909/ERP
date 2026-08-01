import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Button, Card, EmptyState, Field, Input, LinkButton, Pagination, Section, Select, StatusBadge } from "@/components/ui";
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
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ companyId, search: query.search ?? "", status: query.status ?? "ACTIVE", page: String(page) });
    return `/admin/pricing?${params.toString()}`;
  };

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader containerVariant="standard" context="管理員功能" title="正式價格管理" description="管理價格表、品項價格版本與客戶價格表指派。" />
      <Card>
        <form className={`${pageStyles.filterGrid} ${pageStyles.adminFilters}`}>
          <Field label="公司"><Select name="companyId" defaultValue={companyId}>{context.authorizedCompanies.map((company) => <option key={company.id} value={company.id}>{company.code}－{company.name}</option>)}</Select></Field>
          <Field label="搜尋"><Input name="search" defaultValue={query.search} placeholder="名稱或代碼" /></Field>
          <Field label="狀態"><Select name="status" defaultValue={query.status ?? "ACTIVE"}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option><option value="ALL">全部</option></Select></Field>
          <Button type="submit">查詢</Button>
        </form>
      </Card>
      <PriceListCreateClient companyId={companyId} />
      <Card>
        <Section title="價格表清單" description={`共 ${result.pagination.total} 筆`}>
          {result.items.length > 0 ? result.items.map((entry) => (
            <div key={entry.id} className={pageStyles.listRow}>
              <div><strong>{entry.code}－{entry.name}</strong><div className={pageStyles.tableSubtext}><StatusBadge label={entry.status === "ACTIVE" ? "有效" : "停用"} tone={entry.status === "ACTIVE" ? "success" : "neutral"} /></div></div>
              <LinkButton href={`/admin/pricing/${entry.id}?companyId=${companyId}`} variant="secondary" size="small">管理</LinkButton>
            </div>
          )) : <EmptyState variant={query.search?.trim() ? "no-results" : "no-data"} title={query.search?.trim() ? "查無符合條件的價格表" : "尚無價格表"} />}
        </Section>
      </Card>
      <Pagination currentPage={result.pagination.page} totalPages={result.pagination.totalPages} previousHref={result.pagination.page > 1 ? pageHref(result.pagination.page - 1) : undefined} nextHref={result.pagination.page < result.pagination.totalPages ? pageHref(result.pagination.page + 1) : undefined} label="價格表清單分頁" />
    </div>
  );
}
