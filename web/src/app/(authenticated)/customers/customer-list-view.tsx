import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
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

export type CustomerListQuery = {
  companyId?: string;
  search?: string;
  status?: string;
  page?: string;
};

export type CustomersListViewProps = {
  context: {
    authorizedCompanies: Array<{ id: string; code: string; name: string }>;
  };
  query: CustomerListQuery;
  companyId: string;
  result: {
    items: Array<{
      id: string;
      name: string;
      customerType: string;
      taxId: string | null;
      countryCode: string | null;
      foreignIdentifier: string | null;
      companyRelations: Array<{ customerCode: string }>;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
};

export function CustomersListView({
  context,
  query,
  companyId,
  result,
}: CustomersListViewProps) {
  const pageHref = (page: number) => {
    const params = new URLSearchParams({
      companyId,
      search: query.search ?? "",
      status: query.status ?? "ACTIVE",
      page: String(page),
    });
    return `/customers?${params.toString()}`;
  };

  return (
    <main className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="客戶主檔"
        title="客戶查詢"
        description="依公司與關鍵字查詢可使用的客戶。"
      />

      <Card>
        <form className={`${pageStyles.filterGrid} ${pageStyles.customerFilters}`}>
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
            <Input
              name="search"
              defaultValue={query.search}
              placeholder="客戶名稱、統編或公司客戶代碼"
            />
          </Field>
          <input type="hidden" name="status" value="ACTIVE" />
          <Button type="submit">查詢</Button>
        </form>
      </Card>

      <TableContainer>
        <Table>
          <TableCaption>客戶查詢結果</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>公司客戶代碼</TableHead>
              <TableHead>客戶名稱</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>識別資料</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell monospace>
                  {customer.companyRelations[0]?.customerCode ?? "—"}
                </TableCell>
                <TableCell>
                  <Link
                    className={pageStyles.tableLink}
                    href={`/customers/${customer.id}?companyId=${companyId}`}
                  >
                    {customer.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={
                      customer.customerType === "DOMESTIC" ? "境內" : "境外"
                    }
                    tone={
                      customer.customerType === "DOMESTIC" ? "success" : "info"
                    }
                  />
                </TableCell>
                <TableCell>
                  {customer.taxId ??
                    ([customer.countryCode, customer.foreignIdentifier]
                      .filter(Boolean)
                      .join(" / ") ||
                      "—")}
                </TableCell>
              </TableRow>
            ))}
            {result.items.length === 0 ? (
              <TableEmptyRow colSpan={4}>
                <EmptyState
                  variant="no-results"
                  title="查無可使用客戶"
                  description="請調整公司或搜尋條件後再試一次。"
                />
              </TableEmptyRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <div className={pageStyles.tableFooter}>
        <p className={pageStyles.resultCount}>共 {result.pagination.total} 筆</p>
        <Pagination
          currentPage={result.pagination.page}
          totalPages={result.pagination.totalPages}
          previousHref={
            result.pagination.page > 1
              ? pageHref(result.pagination.page - 1)
              : undefined
          }
          nextHref={
            result.pagination.page < result.pagination.totalPages
              ? pageHref(result.pagination.page + 1)
              : undefined
          }
          label="客戶清單分頁"
        />
      </div>
    </main>
  );
}
