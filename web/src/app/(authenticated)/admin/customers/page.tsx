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
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listCustomers } from "@/lib/customers/service";
import { prisma } from "@/lib/prisma";
import { CustomerCreateClient } from "./customer-create-client";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    search?: string;
    status?: string;
    page?: string;
  }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listCustomers(prisma, {
      context,
      companyId,
      query: {
        search: query.search ?? "",
        status: query.status ?? "ACTIVE",
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
      page: String(page),
    });
    return `/admin/customers?${params.toString()}`;
  };

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="主檔管理"
        title="客戶主檔管理"
        description="查詢、建立與維護授權公司範圍內的客戶資料。"
      />

      <Card>
        <form className={pageStyles.adminFilters}>
          <Field label="公司">
            <Select name="companyId" defaultValue={companyId}>
              {context.authorizedCompanies.map((company) => (
                <option key={company.id} value={company.id}>{company.code}－{company.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="搜尋">
            <Input name="search" defaultValue={query.search} placeholder="名稱、統編或客戶代碼" />
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

      <CustomerCreateClient selectedCompanyId={companyId} />

      <TableContainer>
        <Table>
          <TableCaption>客戶管理清單</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>公司客戶代碼</TableHead>
              <TableHead>客戶名稱</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead align="right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {result.items.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell monospace>{customer.companyRelations[0]?.customerCode ?? "—"}</TableCell>
              <TableCell>{customer.name}</TableCell>
              <TableCell>{customer.customerType === "DOMESTIC" ? "境內" : "境外"}</TableCell>
              <TableCell><StatusBadge label={customer.status === "ACTIVE" ? "有效" : "停用"} tone={customer.status === "ACTIVE" ? "success" : "neutral"} /></TableCell>
              <TableCell align="right"><LinkButton size="small" variant="secondary" href={`/admin/customers/${customer.id}?companyId=${companyId}`}>管理</LinkButton></TableCell>
            </TableRow>
          ))}
          {result.items.length === 0 ? <TableEmptyRow colSpan={5}><EmptyState variant="no-results" title="查無客戶資料" description="請調整公司、搜尋字詞或狀態後再試一次。" /></TableEmptyRow> : null}
          </TableBody>
        </Table>
      </TableContainer>

      <div className={pageStyles.tableFooter}>
        <p className={pageStyles.resultCount}>共 {result.pagination.total} 筆</p>
        <Pagination
          currentPage={result.pagination.page}
          totalPages={result.pagination.totalPages}
          previousHref={result.pagination.page > 1 ? pageHref(result.pagination.page - 1) : undefined}
          nextHref={result.pagination.page < result.pagination.totalPages ? pageHref(result.pagination.page + 1) : undefined}
          label="客戶管理清單分頁"
        />
      </div>
    </div>
  );
}
