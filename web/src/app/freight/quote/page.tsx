import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listCustomers } from "@/lib/customers/service";
import {
  FreightRuleNotFoundError,
  quoteFreight,
} from "@/lib/freight/service";
import { prisma } from "@/lib/prisma";

export default async function FreightQuotePage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    selection?: string;
    effectiveDate?: string;
    quantity?: string;
  }>;
}) {
  let context;
  try {
    context = await getPageRequestContext();
  } catch {
    redirect("/login");
  }
  const query = await searchParams;
  const companyId = query.companyId ?? context.selectedCompany.id;
  await listCustomers(prisma, {
    context,
    companyId,
    query: { pageSize: 1 },
  });
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
  const locations = customerRelations.flatMap((relation) =>
    relation.customer.deliveryLocations.map((location) => ({
      id: location.id,
      customerId: relation.customerId,
      label: `${relation.customerCode}－${relation.customer.name}／${location.code}－${location.name}`,
    })),
  );
  const [selectedCustomerId = "", selectedLocationId = ""] =
    query.selection?.split("|") ?? [];
  let result:
    | Awaited<ReturnType<typeof quoteFreight>>
    | { error: string }
    | undefined;
  if (
    selectedCustomerId &&
    selectedLocationId &&
    query.effectiveDate &&
    query.quantity
  ) {
    try {
      result = await quoteFreight(prisma, {
        context,
        companyId,
        customerId: selectedCustomerId,
        deliveryLocationId: selectedLocationId,
        effectiveDate: query.effectiveDate,
        quantity: query.quantity,
      });
    } catch (error) {
      if (error instanceof FreightRuleNotFoundError) {
        result = { error: error.code };
      } else {
        throw error;
      }
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">唯讀查詢</p>
          <h1 className="text-3xl font-bold">運費試算</h1>
        </div>
        <Link href="/" className="rounded-lg border px-4 py-2">
          返回首頁
        </Link>
      </div>
      <form className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2">
        <select
          name="companyId"
          defaultValue={companyId}
          className="rounded-lg border px-3 py-2"
        >
          {context.authorizedCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code}－{company.name}
            </option>
          ))}
        </select>
        <select
          name="selection"
          defaultValue={query.selection ?? ""}
          required
          className="rounded-lg border px-3 py-2"
        >
          <option value="">選擇客戶與送貨地點</option>
          {locations.map((location) => (
            <option
              key={location.id}
              value={`${location.customerId}|${location.id}`}
            >
              {location.label}
            </option>
          ))}
        </select>
        <label className="text-sm">
          生效日期
          <input
            name="effectiveDate"
            type="date"
            defaultValue={query.effectiveDate ?? ""}
            required
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          數量
          <input
            name="quantity"
            inputMode="decimal"
            defaultValue={query.quantity ?? ""}
            required
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <button className="rounded-lg bg-teal-700 px-4 py-2 text-white md:col-span-2 md:justify-self-start">
          試算
        </button>
      </form>
      {result ? (
        <section className="mt-6 rounded-2xl border bg-white p-6">
          {"error" in result ? (
            <p className="font-semibold text-red-700">{result.error}</p>
          ) : (
            <>
              <p className="text-sm text-slate-500">試算運費</p>
              <p className="mt-1 text-3xl font-bold">
                NT$ {result.freightAmount}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                計價方式：{result.mode}｜數量：{result.quantity}
              </p>
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
