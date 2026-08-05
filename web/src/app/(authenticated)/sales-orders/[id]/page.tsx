import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { hasPermission } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/authorization";
import { mapDeliveryNoteSummary } from "@/lib/delivery-notes/api";
import { listDeliveryNotes } from "@/lib/delivery-notes/service";
import { getSalesOrder } from "@/lib/sales-orders/service";
import { prisma } from "@/lib/prisma";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { PageHeader } from "@/components/app-shell/page-header";
import { LinkButton } from "@/components/ui";
import { DeliveryNoteOrderActions } from "../delivery-note-order-actions";
import { SalesOrderDetailView } from "../sales-order-detail-view";
import { SalesOrderEditor } from "../sales-order-editor";
import { SalesOrderStatusActions } from "../sales-order-status-actions";

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    requirePermission(context, "sales_orders.read");
    const companyId = context.selectedCompany.id;
    const orderId = (await params).id;
    const [order, customerRelations, itemRelations, deliveryNoteResult] =
      await Promise.all([
      getSalesOrder(prisma, {
        context,
        companyId,
        orderId,
      }),
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
      }),
      prisma.itemCompany.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          salesEnabled: true,
          item: { status: "ACTIVE", salesEnabled: true },
        },
        include: { item: true },
      }),
      listDeliveryNotes(prisma, {
        context,
        companyId,
        filters: {
          salesOrderId: orderId,
          status: "ALL",
          page: 1,
          pageSize: 100,
        },
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
      initial: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate.toISOString().slice(0, 10),
        customerId: order.customerId,
        deliveryLocationId: order.deliveryLocationId,
        customerContactId: order.customerContactId,
        paymentTermsText: order.paymentTermsText,
        status: order.status,
        revisionNo: order.revisionNo,
        subtotal: order.subtotal.toFixed(0),
        freightAmount: order.freightAmount.toFixed(0),
        totalAmount: order.totalAmount.toFixed(0),
        lines: order.lines
          .filter((line) => line.isActive)
          .map((line) => ({
            id: line.id,
            itemId: line.itemId,
            quantity: line.quantity.toFixed(4),
            unitPrice: line.unitPrice.toFixed(5),
            manualPriceReason: line.manualPriceReason ?? "",
            itemSnapshot: line.itemSnapshot,
          })),
        snapshots: {
          customer: order.customerSnapshot,
          customerCompany: order.customerCompanySnapshot,
          contact: order.contactSnapshot,
          delivery: order.deliverySnapshot,
          company: order.companySnapshot,
          freight: order.freightSnapshot,
          lines: order.lines.map((line) => ({
            lineNumber: line.lineNumber,
            active: line.isActive,
            item: line.itemSnapshot,
            price: line.priceSnapshot,
          })),
        },
      },
      deliveryNotes: deliveryNoteResult.deliveryNotes.map(
        mapDeliveryNoteSummary,
      ),
      canManageDeliveryNotes: hasPermission(
        context.roleCodes,
        "delivery_notes.manage",
      ),
      canManageSalesOrders: hasPermission(
        context.roleCodes,
        "sales_orders.manage",
      ),
    };
  } catch {
    redirect("/sales-orders");
  }

  const { initial, canManageSalesOrders, canManageDeliveryNotes } = data;
  const showEditor = initial.status === "DRAFT" && canManageSalesOrders;

  return (
    <main className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="P3.1 銷售流程"
        title="銷售訂單明細"
        actions={
          <LinkButton href="/sales-orders" variant="secondary">
            返回清單
          </LinkButton>
        }
      />
      <SalesOrderStatusActions
        orderId={initial.id}
        status={initial.status}
        canManage={canManageSalesOrders}
      />
      <DeliveryNoteOrderActions
        salesOrderId={initial.id}
        orderStatus={initial.status}
        revisionNo={initial.revisionNo}
        notes={data.deliveryNotes}
        canManage={canManageDeliveryNotes}
      />
      {showEditor ? (
        <SalesOrderEditor
          customers={data.customers}
          items={data.items}
          initial={initial}
          canManage={canManageSalesOrders}
        />
      ) : (
        <SalesOrderDetailView order={initial} />
      )}
    </main>
  );
}
