import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listSalesOrders } from "@/lib/sales-orders/service";
import { prisma } from "@/lib/prisma";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  SalesOrderListView,
  type SalesOrderListItemView,
} from "./sales-order-list-view";

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
  }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const result = await listSalesOrders(prisma, {
      context,
      companyId: context.selectedCompany.id,
      query: {
        search: query.search ?? "",
        status: query.status ?? "ALL",
        page: query.page ?? "1",
        pageSize: "20",
      },
    });
    data = { context, query, result };
  } catch {
    redirect("/login");
  }
  const { context, query, result } = data;

  const items: SalesOrderListItemView[] = result.orders.map((order) => {
    const customer =
      order.customerSnapshot &&
      typeof order.customerSnapshot === "object" &&
      !Array.isArray(order.customerSnapshot)
        ? (order.customerSnapshot as Record<string, unknown>).name
        : "";
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate.toISOString().slice(0, 10),
      customerName: typeof customer === "string" ? customer : "",
      status: order.status,
      totalAmount: order.totalAmount.toFixed(0),
    };
  });

  return (
    <main className={pageStyles.pageStack}>
      <SalesOrderListView
        company={context.selectedCompany}
        items={items}
        page={result.pagination.page}
        totalPages={result.pagination.totalPages}
        total={result.pagination.total}
        query={{
          search: query.search ?? "",
          status: query.status ?? "ALL",
        }}
      />
    </main>
  );
}
