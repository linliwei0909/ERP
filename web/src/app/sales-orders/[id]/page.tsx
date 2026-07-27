import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { hasPermission } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/authorization";
import { mapDeliveryNoteSummary } from "@/lib/delivery-notes/api";
import { listDeliveryNotes } from "@/lib/delivery-notes/service";
import { getSalesOrder } from "@/lib/sales-orders/service";
import { prisma } from "@/lib/prisma";
import { DeliveryNoteOrderActions } from "../delivery-note-order-actions";
import { SalesOrderEditor } from "../sales-order-editor";

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
    };
  } catch {
    redirect("/sales-orders");
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">銷售訂單明細</h1>
        <Link href="/sales-orders" className="rounded-lg border px-4 py-2">
          返回清單
        </Link>
      </div>
      <div className="mt-8 space-y-6">
        <DeliveryNoteOrderActions
          salesOrderId={data.initial.id}
          orderStatus={data.initial.status}
          revisionNo={data.initial.revisionNo}
          notes={data.deliveryNotes}
          canManage={data.canManageDeliveryNotes}
        />
        <SalesOrderEditor
          customers={data.customers}
          items={data.items}
          initial={data.initial}
        />
      </div>
    </main>
  );
}
