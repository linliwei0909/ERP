import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { requirePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { PageHeader } from "@/components/app-shell/page-header";
import { LinkButton } from "@/components/ui";
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
    <main className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="P3.1 銷售流程"
        title="建立銷售訂單草稿"
        actions={<LinkButton href="/sales-orders" variant="secondary">返回清單</LinkButton>}
      />
      <SalesOrderEditor {...data} />
    </main>
  );
}
