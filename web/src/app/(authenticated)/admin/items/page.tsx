import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Pagination,
  Section,
  Select,
  StatusBadge,
} from "@/components/ui";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listItems } from "@/lib/items/service";
import { prisma } from "@/lib/prisma";
import { ItemCreateClient } from "./item-create-client";

export default async function AdminItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    search?: string;
    status?: string;
    itemType?: string;
    page?: string;
  }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listItems(prisma, {
      context,
      companyId,
      query: {
        search: query.search ?? "",
        status: query.status ?? "ACTIVE",
        itemType: query.itemType ?? "ALL",
        availability: "ALL",
        page: query.page ?? "1",
        pageSize: "20",
      },
    });
    pageData = { context, query, companyId, result };
  } catch {
    redirect("/");
  }
  const { context, query, companyId, result } = pageData;
  const pageHref = (page: number) => {
    const params = new URLSearchParams({
      companyId,
      search: query.search ?? "",
      status: query.status ?? "ACTIVE",
      itemType: query.itemType ?? "ALL",
      page: String(page),
    });
    return `/admin/items?${params.toString()}`;
  };

  return (
    <main className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="standard"
        context="管理員功能"
        title="品項主檔管理"
        description="管理品項基本資料與公司品項設定。"
      />

      <Card>
        <form className={`${pageStyles.filterGrid} ${pageStyles.adminFilters}`}>
          <Field label="公司">
            <Select name="companyId" defaultValue={companyId}>
              {context.authorizedCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code}－{company.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="搜尋">
            <Input name="search" defaultValue={query.search} placeholder="名稱、代碼或條碼" />
          </Field>
          <Field label="品項類型">
            <Select name="itemType" defaultValue={query.itemType ?? "ALL"}>
              <option value="ALL">全部類型</option>
              <option value="PRODUCT">產品</option>
              <option value="RAW_MATERIAL">原物料</option>
            </Select>
          </Field>
          <Field label="狀態">
            <Select name="status" defaultValue={query.status ?? "ACTIVE"}>
              <option value="ACTIVE">有效</option>
              <option value="INACTIVE">停用</option>
              <option value="ALL">全部</option>
            </Select>
          </Field>
          <Button type="submit">搜尋</Button>
        </form>
      </Card>

      <ItemCreateClient selectedCompanyId={companyId} />

      <Section title="品項清單" description={`共 ${result.pagination.total} 筆`}>
        <div>
          {result.items.map((item) => (
            <div
              key={item.id}
              className={pageStyles.listRow}
            >
              <div>
                <div>
                  {item.companyRelations[0]?.companyItemCode}－{item.name}
                </div>
                <div className={pageStyles.tableSubtext}>
                  {item.code}／{item.itemType === "PRODUCT" ? "產品" : "原物料"}　
                  <StatusBadge
                    label={item.status === "ACTIVE" ? "有效" : "停用"}
                    tone={item.status === "ACTIVE" ? "success" : "neutral"}
                  />
                </div>
              </div>
              <LinkButton
                href={`/admin/items/${item.id}?companyId=${companyId}`}
                variant="secondary"
                size="small"
              >
                管理
              </LinkButton>
            </div>
          ))}
          {result.items.length === 0 ? (
            <EmptyState variant="no-results" title="查無品項" description="請調整篩選條件後再試一次。" />
          ) : null}
        </div>
      </Section>

      <Pagination
        currentPage={result.pagination.page}
        totalPages={result.pagination.totalPages}
        previousHref={result.pagination.page > 1 ? pageHref(result.pagination.page - 1) : undefined}
        nextHref={result.pagination.page < result.pagination.totalPages ? pageHref(result.pagination.page + 1) : undefined}
        label="品項清單分頁"
      />
    </main>
  );
}
