import Link from "next/link";
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
  type StatusTone,
} from "@/components/ui";

export const SALES_ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  CONFIRMED: "已確認",
  DELIVERY_CREATED: "已建立銷貨單",
  SHIPPED: "已出貨",
  COMPLETED: "已完成",
  VOIDED: "作廢",
};

export function salesOrderStatusTone(status: string): StatusTone {
  switch (status) {
    case "VOIDED":
      return "danger";
    case "COMPLETED":
      return "success";
    case "SHIPPED":
      return "warning";
    case "CONFIRMED":
    case "DELIVERY_CREATED":
      return "info";
    default:
      return "neutral";
  }
}

export type SalesOrderListItemView = {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  status: string;
  totalAmount: string;
};

export type SalesOrderListQuery = {
  search: string;
  status: string;
};

export function SalesOrderListView({
  company,
  items,
  page,
  totalPages,
  total,
  query,
}: {
  company: { code: string; name: string };
  items: SalesOrderListItemView[];
  page: number;
  totalPages: number;
  total: number;
  query: SalesOrderListQuery;
}) {
  const pageHref = (target: number) => {
    const params = new URLSearchParams({
      search: query.search,
      status: query.status,
      page: String(target),
    });
    for (const [key, value] of [...params.entries()]) {
      if (!value || (key === "status" && value === "ALL")) {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `/sales-orders?${qs}` : "/sales-orders";
  };

  const isFiltered = Boolean(query.search) || query.status !== "ALL";

  return (
    <>
      <PageHeader
        containerVariant="wide"
        context="P3.1 銷售流程"
        title="銷售訂單"
        metadata={[
          { label: "目前公司", value: `${company.code}－${company.name}` },
        ]}
        actions={
          <>
            <LinkButton href="/" variant="secondary">
              返回首頁
            </LinkButton>
            <LinkButton href="/sales-orders/new">建立草稿</LinkButton>
          </>
        }
      />

      <Card>
        <form className={pageStyles.filterGrid}>
          <Field label="訂單號或客戶名稱">
            <Input
              name="search"
              defaultValue={query.search}
              placeholder="訂單號或客戶名稱"
            />
          </Field>
          <Field label="狀態">
            <Select name="status" defaultValue={query.status}>
              <option value="ALL">全部狀態</option>
              {Object.entries(SALES_ORDER_STATUS_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Button type="submit">查詢</Button>
        </form>
      </Card>

      <TableContainer>
        <Table>
          <TableCaption>銷售訂單查詢結果</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>訂單號</TableHead>
              <TableHead>訂單日期</TableHead>
              <TableHead>客戶</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead align="right">未稅總額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((order) => (
              <TableRow key={order.id}>
                <TableCell monospace>
                  <Link
                    href={`/sales-orders/${order.id}`}
                    className={pageStyles.tableLink}
                  >
                    {order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>{order.orderDate}</TableCell>
                <TableCell>{order.customerName || "—"}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={
                      SALES_ORDER_STATUS_LABELS[order.status] ?? order.status
                    }
                    tone={salesOrderStatusTone(order.status)}
                  />
                </TableCell>
                <TableCell align="right" numeric>
                  NT$ {order.totalAmount}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 ? (
              <TableEmptyRow colSpan={5}>
                <EmptyState
                  variant={isFiltered ? "no-results" : "no-data"}
                  title={isFiltered ? "查無符合條件的訂單" : "尚無銷售訂單"}
                  description={
                    isFiltered
                      ? "請調整搜尋條件或狀態篩選後重新查詢。"
                      : "建立草稿即可開始銷售訂單流程。"
                  }
                />
              </TableEmptyRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <div className={pageStyles.tableFooter}>
        <p className={pageStyles.resultCount}>共 {total} 筆</p>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          previousHref={page > 1 ? pageHref(page - 1) : undefined}
          nextHref={page < totalPages ? pageHref(page + 1) : undefined}
          label="銷售訂單清單分頁"
        />
      </div>
    </>
  );
}
