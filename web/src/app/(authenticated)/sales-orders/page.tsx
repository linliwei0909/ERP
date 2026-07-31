import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listSalesOrders } from "@/lib/sales-orders/service";
import { prisma } from "@/lib/prisma";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  CONFIRMED: "已確認",
  DELIVERY_CREATED: "已建立銷貨單",
  SHIPPED: "已出貨",
  COMPLETED: "已完成",
  VOIDED: "作廢",
};

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

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teal-700">P3.1 銷售流程</p>
          <h1 className="text-3xl font-bold">銷售訂單</h1>
          <p className="mt-1 text-sm text-slate-500">
            目前公司：{context.selectedCompany.code}－
            {context.selectedCompany.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="rounded-lg border px-4 py-2">
            返回首頁
          </Link>
          <Link
            href="/sales-orders/new"
            className="rounded-lg bg-teal-700 px-4 py-2 text-white"
          >
            建立草稿
          </Link>
        </div>
      </div>

      <form className="mt-8 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-4">
        <input
          name="search"
          defaultValue={query.search}
          placeholder="訂單號或客戶名稱"
          className="rounded-lg border px-3 py-2 md:col-span-2"
        />
        <select
          name="status"
          defaultValue={query.status ?? "ALL"}
          className="rounded-lg border px-3 py-2"
        >
          <option value="ALL">全部狀態</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-white">
          查詢
        </button>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
        <div className="divide-y">
          {result.orders.map((order) => {
            const customer =
              order.customerSnapshot &&
              typeof order.customerSnapshot === "object" &&
              !Array.isArray(order.customerSnapshot)
                ? (order.customerSnapshot as Record<string, unknown>).name
                : "";
            return (
              <Link
                key={order.id}
                href={`/sales-orders/${order.id}`}
                className="grid gap-2 px-5 py-4 hover:bg-slate-50 md:grid-cols-5"
              >
                <strong>{order.orderNumber}</strong>
                <span>{order.orderDate.toISOString().slice(0, 10)}</span>
                <span>{String(customer ?? "")}</span>
                <span>{STATUS_LABELS[order.status]}</span>
                <span className="text-right">
                  未稅總額 NT$ {order.totalAmount.toFixed(0)}
                </span>
              </Link>
            );
          })}
          {result.orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-slate-500">查無訂單。</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
