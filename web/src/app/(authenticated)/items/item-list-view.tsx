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

export type ItemListQuery = {
  companyId?: string;
  search?: string;
  itemType?: string;
  page?: string;
};

type ItemsListViewProps = {
  context: {
    authorizedCompanies: Array<{ id: string; code: string; name: string }>;
  };
  query: ItemListQuery;
  companyId: string;
  result: {
    items: Array<{
      id: string;
      code: string;
      name: string;
      itemType: string;
      baseUnit: string;
      barcode: string | null;
      companyRelations: Array<{ companyItemCode: string }>;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
};

export function ItemsListView({
  context,
  query,
  companyId,
  result,
}: ItemsListViewProps) {
  const hasFilter = Boolean(query.search?.trim()) ||
    (query.itemType !== undefined && query.itemType !== "ALL");
  const pageHref = (page: number) => {
    const params = new URLSearchParams({
      companyId,
      search: query.search ?? "",
      itemType: query.itemType ?? "ALL",
      page: String(page),
    });
    return `/items?${params.toString()}`;
  };

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="品項主檔"
        title="可銷售品項查詢"
        description="依公司、關鍵字與品項類型查詢可銷售品項。"
      />

      <Card>
        <form className={pageStyles.filterGrid}>
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
              placeholder="品項名稱、代碼、公司品項代碼或條碼"
            />
          </Field>
          <Field label="品項類型">
            <Select name="itemType" defaultValue={query.itemType ?? "ALL"}>
              <option value="ALL">全部</option>
              <option value="PRODUCT">產品</option>
              <option value="RAW_MATERIAL">原物料</option>
            </Select>
          </Field>
          <Button type="submit">查詢</Button>
        </form>
      </Card>

      <TableContainer>
        <Table>
          <TableCaption>可銷售品項查詢結果</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>公司品項代碼</TableHead>
              <TableHead>品項</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>基本單位</TableHead>
              <TableHead>條碼</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell monospace>
                  {item.companyRelations[0]?.companyItemCode ?? "—"}
                </TableCell>
                <TableCell>
                  <Link
                    className={pageStyles.tableLink}
                    href={`/items/${item.id}?companyId=${companyId}`}
                  >
                    {item.code}－{item.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={item.itemType === "PRODUCT" ? "產品" : "原物料"}
                    tone={item.itemType === "PRODUCT" ? "success" : "info"}
                  />
                </TableCell>
                <TableCell>{item.baseUnit}</TableCell>
                <TableCell>{item.barcode ?? "—"}</TableCell>
              </TableRow>
            ))}
            {result.items.length === 0 ? (
              <TableEmptyRow colSpan={5}>
                <EmptyState
                  variant={hasFilter ? "no-results" : "no-data"}
                  title={hasFilter ? "查無符合條件的品項" : "尚無可銷售品項"}
                  description={
                    hasFilter
                      ? "請調整搜尋或品項類型後再試一次。"
                      : "目前公司尚無可供查詢的可銷售品項。"
                  }
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
          label="品項清單分頁"
        />
      </div>
    </div>
  );
}
