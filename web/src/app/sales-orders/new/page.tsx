import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { requirePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { SalesOrderEditor } from "../sales-order-editor";

export default async function NewSalesOrderPage() {
  let data;
  try {
    const context = await getPageRequestContext();
    requirePermission(context, "sales_orders.manage");
    const companyId = context.selectedCompany.id;
    const [customerRelations, itemRelations] = await Promise.all([
      prisma.customerCompany.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          customer: { status: "ACTIVE" },
        },
        include: {
          customer: {
            include: {
              contacts: { where: { status: "ACTIVE" } },
              deliveryLocations: { where: { status: "ACTIVE" } },
            },
          },
        },
        orderBy: { customerCode: "asc" },
      }),
      prisma.itemCompany.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          salesEnabled: true,
          item: { status: "ACTIVE", salesEnabled: true },
        },
        include: { item: true },
        orderBy: { companyItemCode: "asc" },
      }),
    ]);
    data = {
      customers: customerRelations.map((relation) => ({
        id: relation.customerId,
        code: relation.customerCode,
        name: relation.customer.name,
        contacts: relation.customer.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
        })),
        locations: relation.customer.deliveryLocations.map((location) => ({
          id: location.id,
          code: location.code,
          name: location.name,
        })),
      })),
      items: itemRelations.map((relation) => ({
        id: relation.itemId,
        code: relation.companyItemCode,
        name: relation.item.name,
        baseUnit: relation.item.baseUnit,
      })),
    };
  } catch {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">建立銷售訂單草稿</h1>
        <Link href="/sales-orders" className="rounded-lg border px-4 py-2">
          返回清單
        </Link>
      </div>
      <SalesOrderEditor {...data} />
    </main>
  );
}
