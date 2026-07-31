import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listCustomers } from "@/lib/customers/service";
import { listAvailableItems } from "@/lib/items/service";
import { getPriceList } from "@/lib/pricing/service";
import { toDateText } from "@/lib/pricing/validation";
import { prisma } from "@/lib/prisma";
import { PricingManagerClient, type ManagedPriceList } from "./pricing-manager-client";

export default async function PricingDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ companyId?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const companyId = (await searchParams).companyId ?? context.selectedCompany.id;
    const [priceList, items, customers] = await Promise.all([
      getPriceList(prisma, { context, companyId, priceListId: (await params).id }),
      listAvailableItems(prisma, { context, companyId, query: { pageSize: 100 } }),
      listCustomers(prisma, { context, companyId, query: { pageSize: 100, status: "ACTIVE" } }),
    ]);
    data = { companyId, priceList, items, customers };
  } catch { redirect("/admin/pricing"); }
  const managed: ManagedPriceList = {
    id: data.priceList.id,
    code: data.priceList.code,
    name: data.priceList.name,
    status: data.priceList.status,
    itemPrices: data.priceList.itemPrices.map((value) => ({
      id: value.id, itemId: value.itemId, unitPrice: value.unitPrice.toFixed(5),
      validFrom: toDateText(value.validFrom), validTo: value.validTo ? toDateText(value.validTo) : null,
      status: value.status, item: value.item,
    })),
    assignments: data.priceList.assignments.map((value) => ({
      id: value.id, customerId: value.customerId, validFrom: toDateText(value.validFrom),
      validTo: value.validTo ? toDateText(value.validTo) : null, status: value.status, customer: value.customer,
    })),
  };
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex justify-between"><div><p className="text-sm font-semibold text-teal-700">正式價格管理</p><h1 className="text-3xl font-bold">{data.priceList.name}</h1></div><Link href={`/admin/pricing?companyId=${data.companyId}`} className="rounded-lg border px-4 py-2">返回清單</Link></div>
      <PricingManagerClient
        priceList={managed}
        companyId={data.companyId}
        items={data.items.items.map((item) => ({ id: item.id, label: `${item.code}－${item.name}` }))}
        customers={data.customers.items.map((customer) => ({ id: customer.id, label: customer.name }))}
      />
    </main>
  );
}
