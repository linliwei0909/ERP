"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { nextDocumentNumber, parseDate } from "@/lib/sales";

const positiveId = z.coerce.number().int().positive();
const positiveNumber = z.coerce.number().positive();

function messagePath(path: string, kind: "error" | "success", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "處理失敗";
}

async function recalculateOrder(tx: Prisma.TransactionClient, orderId: number) {
  const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) throw new Error("銷售訂單不存在");
  const net = order.lines.reduce((sum, line) => sum + Number(line.netAmount), 0);
  const tax = order.lines.reduce((sum, line) => sum + Number(line.taxAmount), 0);
  await tx.salesOrder.update({
    where: { id: orderId },
    data: { netAmount: net.toFixed(2), taxAmount: tax.toFixed(2), totalAmount: (net + tax + Number(order.freightAmount)).toFixed(2) },
  });
}

export async function createSalesOrder(formData: FormData) {
  const parsed = z.object({
    customerId: positiveId,
    shippingAddressId: z.preprocess((value) => value === "" ? undefined : value, positiveId.optional()),
    orderDate: z.string().min(1),
    expectedShipDate: z.string(),
    note: z.string().trim(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath("/sales-orders/new", "error", "請檢查訂單資料"));

  let orderId: number | null = null;
  let failure: string | null = null;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: parsed.data.customerId, status: "ACTIVE", company: { status: "ACTIVE" }, priceList: { status: "ACTIVE" } },
        include: { company: true, priceList: true },
      });
      if (!customer) throw new Error("客戶、銷售公司或價格表不存在或已停用");
      const shipping = parsed.data.shippingAddressId ? await tx.customerShippingAddress.findFirst({
        where: { id: parsed.data.shippingAddressId, customerId: customer.id, status: "ACTIVE" },
      }) : null;
      if (parsed.data.shippingAddressId && !shipping) throw new Error("送貨地址不屬於此客戶或已停用");
      const shippingAddress = shipping?.address ?? customer.address;
      if (!shippingAddress) throw new Error("客戶未設定可用的送貨地址");
      const orderDate = parseDate(parsed.data.orderDate, true)!;
      const number = await nextDocumentNumber(tx, customer.companyId, "SALES_ORDER", "SO", orderDate);
      const order = await tx.salesOrder.create({
        data: {
          companyId: customer.companyId,
          customerId: customer.id,
          shippingAddressId: shipping?.id,
          number,
          orderDate,
          expectedShipDate: parseDate(parsed.data.expectedShipDate),
          currency: customer.priceList.currency,
          priceListCodeSnapshot: customer.priceList.code,
          priceListNameSnapshot: customer.priceList.name,
          customerCodeSnapshot: customer.code,
          customerNameSnapshot: customer.name,
          customerTaxIdSnapshot: customer.taxId,
          contactNameSnapshot: customer.contactName,
          phoneSnapshot: customer.phone ?? customer.mobile,
          shippingLabelSnapshot: shipping?.label ?? "客戶地址",
          recipientNameSnapshot: shipping?.recipientName ?? customer.contactName,
          recipientPhoneSnapshot: shipping?.recipientPhone ?? customer.phone ?? customer.mobile,
          shippingPostalSnapshot: shipping?.postalCode,
          shippingAddressSnapshot: shippingAddress,
          shippingNoteSnapshot: shipping?.note,
          paymentTermsSnapshot: customer.paymentTerms,
          salesOwnerSnapshot: customer.salesOwner,
          freightAmount: shipping?.shippingFeeMarkup ?? 0,
          netAmount: 0,
          totalAmount: shipping?.shippingFeeMarkup ?? 0,
          note: parsed.data.note || null,
        },
      });
      return order.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || orderId === null) redirect(messagePath("/sales-orders/new", "error", failure ?? "建立訂單失敗"));
  revalidatePath("/sales-orders");
  redirect(`/sales-orders/${orderId}?success=${encodeURIComponent("銷售訂單已建立，請加入品項")}`);
}

export async function addSalesOrderLine(orderId: number, formData: FormData) {
  const parsed = z.object({ itemId: positiveId, quantity: positiveNumber, note: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/sales-orders/${orderId}`, "error", "請選擇品項並輸入正確數量"));
  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { customer: true, lines: true } });
      if (!order || order.status !== "DRAFT") throw new Error("只有草稿訂單可以新增品項");
      if (order.lines.some((line) => line.itemId === parsed.data.itemId)) throw new Error("相同品項已在訂單中");
      const price = await tx.priceListItem.findFirst({
        where: { priceListId: order.customer.priceListId, itemId: parsed.data.itemId, item: { status: "ACTIVE" } },
        include: { item: true },
      });
      if (!price) throw new Error("此品項不在客戶價格表或已停用");
      const unitPrice = Number(price.unitPrice);
      const net = parsed.data.quantity * unitPrice;
      await tx.salesOrderLine.create({
        data: {
          salesOrderId: order.id,
          lineNo: order.lines.length + 1,
          itemId: price.itemId,
          productCompanyIdSnapshot: price.item.companyId,
          itemCodeSnapshot: price.item.code,
          itemNameSnapshot: price.item.name,
          itemSpecSnapshot: price.item.spec,
          unitSnapshot: price.item.unit,
          orderedQuantity: parsed.data.quantity.toString(),
          unitPrice: price.unitPrice,
          netAmount: net.toFixed(2),
          totalAmount: net.toFixed(2),
          note: parsed.data.note || null,
        },
      });
      await recalculateOrder(tx, order.id);
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/sales-orders/${orderId}`, "error", failure));
  revalidatePath(`/sales-orders/${orderId}`);
  redirect(messagePath(`/sales-orders/${orderId}`, "success", "訂單品項已加入"));
}

export async function confirmSalesOrder(orderId: number) {
  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
      if (!order || order.status !== "DRAFT") throw new Error("只有草稿訂單可以確認");
      if (order.lines.length === 0) throw new Error("訂單至少需要一筆明細");
      await tx.salesOrder.update({ where: { id: orderId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/sales-orders/${orderId}`, "error", failure));
  revalidatePath("/sales-orders");
  redirect(messagePath(`/sales-orders/${orderId}`, "success", "訂單已確認；此動作不預留或扣減庫存"));
}

export async function createSalesDelivery(orderId: number, formData: FormData) {
  const parsed = z.object({ warehouseId: positiveId, deliveryDate: z.string().min(1), note: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/sales-orders/${orderId}`, "error", "請檢查銷貨資料"));
  let deliveryId: number | null = null;
  let failure: string | null = null;
  try {
    deliveryId = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: { lines: { include: { deliverySources: { where: { salesDeliveryLine: { salesDelivery: { status: { not: "CANCELLED" } } } } } } } },
      });
      if (!order || !["CONFIRMED", "PARTIALLY_DELIVERED"].includes(order.status)) throw new Error("訂單狀態不可建立銷貨單");
      const warehouse = await tx.warehouse.findFirst({ where: { id: parsed.data.warehouseId, status: "ACTIVE" } });
      if (!warehouse) throw new Error("倉庫不存在或已停用");
      const requested = order.lines.map((line) => ({ line, quantity: Number(formData.get(`quantity_${line.id}`) ?? 0) })).filter((entry) => entry.quantity > 0);
      if (requested.length === 0) throw new Error("至少輸入一筆本次銷貨數量");
      for (const entry of requested) {
        const allocated = entry.line.deliverySources.reduce((sum, source) => sum + Number(source.quantity), 0);
        const outstanding = Number(entry.line.orderedQuantity) - Number(entry.line.cancelledQuantity) - allocated;
        if (entry.quantity > outstanding + 0.0001) throw new Error(`${entry.line.itemCodeSnapshot} 銷貨數量超過未銷貨數量`);
      }
      const deliveryDate = parseDate(parsed.data.deliveryDate, true)!;
      const number = await nextDocumentNumber(tx, order.companyId, "SALES_DELIVERY", "SD", deliveryDate);
      const delivery = await tx.salesDelivery.create({
        data: {
          companyId: order.companyId,
          customerId: order.customerId,
          salesOrderId: order.id,
          warehouseId: warehouse.id,
          number,
          deliveryDate,
          expectedShipDate: order.expectedShipDate,
          customerCodeSnapshot: order.customerCodeSnapshot,
          customerNameSnapshot: order.customerNameSnapshot,
          customerTaxIdSnapshot: order.customerTaxIdSnapshot,
          recipientNameSnapshot: order.recipientNameSnapshot,
          recipientPhoneSnapshot: order.recipientPhoneSnapshot,
          shippingPostalSnapshot: order.shippingPostalSnapshot,
          shippingAddressSnapshot: order.shippingAddressSnapshot,
          shippingNoteSnapshot: order.shippingNoteSnapshot,
          status: "PENDING_ISSUE",
          note: parsed.data.note || null,
        },
      });
      for (const [index, entry] of requested.entries()) {
        const net = entry.quantity * Number(entry.line.unitPrice) * (1 - Number(entry.line.discountRate) / 100);
        const tax = net * Number(entry.line.taxRate) / 100;
        const line = await tx.salesDeliveryLine.create({
          data: {
            salesDeliveryId: delivery.id,
            lineNo: index + 1,
            itemId: entry.line.itemId,
            productCompanyIdSnapshot: entry.line.productCompanyIdSnapshot,
            itemCodeSnapshot: entry.line.itemCodeSnapshot,
            itemNameSnapshot: entry.line.itemNameSnapshot,
            itemSpecSnapshot: entry.line.itemSpecSnapshot,
            unitSnapshot: entry.line.unitSnapshot,
            deliveredQuantity: entry.quantity.toString(),
            unitPrice: entry.line.unitPrice,
            discountRate: entry.line.discountRate,
            taxRate: entry.line.taxRate,
            netAmount: net.toFixed(2),
            taxAmount: tax.toFixed(2),
            totalAmount: (net + tax).toFixed(2),
            note: entry.line.note,
          },
        });
        await tx.salesDeliveryLineSource.create({ data: { salesDeliveryLineId: line.id, salesOrderLineId: entry.line.id, quantity: entry.quantity.toString() } });
      }
      return delivery.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || deliveryId === null) redirect(messagePath(`/sales-orders/${orderId}`, "error", failure ?? "建立銷貨單失敗"));
  revalidatePath("/sales-deliveries");
  redirect(`/sales-deliveries/${deliveryId}?success=${encodeURIComponent("銷貨單已建立，請指定出庫批號")}`);
}

export async function allocateDeliveryLot(deliveryId: number, lineId: number, formData: FormData) {
  const parsed = z.object({ inventoryLotId: positiveId, quantity: positiveNumber }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/sales-deliveries/${deliveryId}`, "error", "請選擇批號並輸入數量"));
  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const line = await tx.salesDeliveryLine.findFirst({
        where: { id: lineId, salesDeliveryId: deliveryId, salesDelivery: { status: "PENDING_ISSUE" } },
        include: { salesDelivery: true, lots: true },
      });
      if (!line) throw new Error("銷貨明細不存在或已出庫");
      const lot = await tx.inventoryLot.findFirst({ where: { id: parsed.data.inventoryLotId, itemId: line.itemId, warehouseId: line.salesDelivery.warehouseId, status: "AVAILABLE" } });
      if (!lot) throw new Error("批號不屬於此品項與出庫倉庫");
      if (parsed.data.quantity > Number(lot.quantity)) throw new Error("分配數量超過批號可用庫存");
      const otherTotal = line.lots.filter((entry) => entry.inventoryLotId !== lot.id).reduce((sum, entry) => sum + Number(entry.quantity), 0);
      if (otherTotal + parsed.data.quantity > Number(line.deliveredQuantity) + 0.0001) throw new Error("批號分配總量超過銷貨數量");
      await tx.salesDeliveryLot.upsert({
        where: { salesDeliveryLineId_inventoryLotId: { salesDeliveryLineId: line.id, inventoryLotId: lot.id } },
        create: { salesDeliveryLineId: line.id, inventoryLotId: lot.id, quantity: parsed.data.quantity.toString() },
        update: { quantity: parsed.data.quantity.toString() },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/sales-deliveries/${deliveryId}`, "error", failure));
  revalidatePath(`/sales-deliveries/${deliveryId}`);
  redirect(messagePath(`/sales-deliveries/${deliveryId}`, "success", "批號分配已儲存"));
}

export async function postSalesDelivery(deliveryId: number) {
  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const delivery = await tx.salesDelivery.findUnique({
        where: { id: deliveryId },
        include: { lines: { include: { lots: { include: { inventoryLot: true } }, orderSources: true } } },
      });
      if (!delivery || delivery.status !== "PENDING_ISSUE") throw new Error("銷貨單狀態不允許出庫");
      if (delivery.lines.length === 0) throw new Error("銷貨單沒有明細");
      for (const line of delivery.lines) {
        const allocated = line.lots.reduce((sum, lot) => sum + Number(lot.quantity), 0);
        if (Math.abs(allocated - Number(line.deliveredQuantity)) > 0.0001) throw new Error(`${line.itemCodeSnapshot} 的批號分配總量必須等於銷貨數量`);
        for (const lot of line.lots) {
          if (lot.inventoryLot.itemId !== line.itemId || lot.inventoryLot.warehouseId !== delivery.warehouseId) throw new Error("批號與銷貨品項或倉庫不符");
          const updated = await tx.inventoryLot.updateMany({
            where: { id: lot.inventoryLotId, status: "AVAILABLE", quantity: { gte: lot.quantity } },
            data: { quantity: { decrement: lot.quantity } },
          });
          if (updated.count !== 1) throw new Error(`${line.itemCodeSnapshot} 批號庫存不足，出庫已取消`);
          await tx.stockMovement.create({
            data: {
              itemId: line.itemId,
              warehouseId: delivery.warehouseId,
              inventoryLotId: lot.inventoryLotId,
              salesDeliveryLotId: lot.id,
              movementType: "ISSUE",
              quantity: (-Number(lot.quantity)).toString(),
              unitCost: lot.inventoryLot.unitCost,
              occurredAt: delivery.deliveryDate,
              sourceType: "SALES_DELIVERY",
              sourceNo: delivery.number,
              note: `銷貨出庫 ${delivery.number}`,
            },
          });
        }
        for (const source of line.orderSources) {
          await tx.salesOrderLine.update({ where: { id: source.salesOrderLineId }, data: { deliveredQuantity: { increment: source.quantity } } });
        }
      }
      await tx.salesDelivery.update({ where: { id: delivery.id }, data: { status: "ISSUED", postedAt: new Date() } });
      const orderLines = await tx.salesOrderLine.findMany({ where: { salesOrderId: delivery.salesOrderId } });
      const complete = orderLines.every((line) => Number(line.deliveredQuantity) + Number(line.cancelledQuantity) >= Number(line.orderedQuantity) - 0.0001);
      await tx.salesOrder.update({ where: { id: delivery.salesOrderId }, data: { status: complete ? "COMPLETED" : "PARTIALLY_DELIVERED" } });
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/sales-deliveries/${deliveryId}`, "error", failure));
  revalidatePath("/sales-orders");
  revalidatePath("/sales-deliveries");
  revalidatePath("/inventory");
  redirect(messagePath(`/sales-deliveries/${deliveryId}`, "success", "出庫完成，已扣減批號庫存並建立異動"));
}

export async function createArInvoiceFromDelivery(deliveryId: number, formData: FormData) {
  const parsed = z.object({ invoiceDate: z.string().min(1), dueDate: z.string(), governmentInvoiceNumber: z.string().trim().max(20), note: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/sales-deliveries/${deliveryId}`, "error", "請檢查應收發票資料"));
  let invoiceId: number | null = null;
  let failure: string | null = null;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const delivery = await tx.salesDelivery.findUnique({
        where: { id: deliveryId },
        include: { arInvoice: true, customer: true, salesOrder: true, lines: true },
      });
      if (!delivery || delivery.status !== "ISSUED") throw new Error("銷貨單尚未完成出庫");
      if (delivery.arInvoice) throw new Error("此銷貨單已建立應收發票");
      const invoiceDate = parseDate(parsed.data.invoiceDate, true)!;
      const number = await nextDocumentNumber(tx, delivery.companyId, "AR_INVOICE", "AR", invoiceDate);
      const net = delivery.lines.reduce((sum, line) => sum + Number(line.netAmount), 0);
      const tax = delivery.lines.reduce((sum, line) => sum + Number(line.taxAmount), 0);
      const total = net + tax;
      const invoice = await tx.arInvoice.create({
        data: {
          companyId: delivery.companyId,
          customerId: delivery.customerId,
          salesDeliveryId: delivery.id,
          number,
          invoiceDate,
          billingMonth: invoiceDate.toISOString().slice(0, 7).replace("-", ""),
          dueDate: parseDate(parsed.data.dueDate),
          currency: delivery.salesOrder.currency,
          exchangeRate: delivery.salesOrder.exchangeRate,
          customerCodeSnapshot: delivery.customerCodeSnapshot,
          customerNameSnapshot: delivery.customerNameSnapshot,
          customerTaxIdSnapshot: delivery.customerTaxIdSnapshot,
          billingAddressSnapshot: delivery.customer.invoiceAddress ?? delivery.customer.address,
          netAmount: net.toFixed(2),
          taxAmount: tax.toFixed(2),
          totalAmount: total.toFixed(2),
          remainingBalance: total.toFixed(2),
          governmentInvoiceNumber: parsed.data.governmentInvoiceNumber || null,
          governmentInvoiceIssued: Boolean(parsed.data.governmentInvoiceNumber),
          note: parsed.data.note || null,
        },
      });
      for (const line of delivery.lines) {
        const arLine = await tx.arInvoiceLine.create({
          data: {
            arInvoiceId: invoice.id,
            lineNo: line.lineNo,
            itemId: line.itemId,
            itemCodeSnapshot: line.itemCodeSnapshot,
            descriptionSnapshot: line.itemNameSnapshot,
            itemSpecSnapshot: line.itemSpecSnapshot,
            unitSnapshot: line.unitSnapshot,
            quantity: line.deliveredQuantity,
            unitPrice: line.unitPrice,
            discountRate: line.discountRate,
            taxRate: line.taxRate,
            netAmount: line.netAmount,
            taxAmount: line.taxAmount,
            totalAmount: line.totalAmount,
            note: line.note,
          },
        });
        await tx.arInvoiceLineSource.create({ data: { arInvoiceLineId: arLine.id, salesDeliveryLineId: line.id, matchedQuantity: line.deliveredQuantity, matchedAmount: line.totalAmount } });
      }
      return invoice.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || invoiceId === null) redirect(messagePath(`/sales-deliveries/${deliveryId}`, "error", failure ?? "建立應收發票失敗"));
  revalidatePath("/ar-invoices");
  redirect(`/ar-invoices/${invoiceId}?success=${encodeURIComponent("已由銷貨單建立應收發票")}`);
}

export async function postArInvoice(invoiceId: number) {
  const result = await prisma.arInvoice.updateMany({ where: { id: invoiceId, status: "DRAFT" }, data: { status: "POSTED", postedAt: new Date() } });
  if (result.count !== 1) redirect(messagePath(`/ar-invoices/${invoiceId}`, "error", "應收發票狀態不允許立帳"));
  revalidatePath("/ar-invoices");
  redirect(messagePath(`/ar-invoices/${invoiceId}`, "success", "應收發票已立帳"));
}

export async function createReceiptForInvoice(invoiceId: number, formData: FormData) {
  const parsed = z.object({ receiptDate: z.string().min(1), paymentMethod: z.string().trim().min(1).max(50), amount: positiveNumber, note: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/ar-invoices/${invoiceId}`, "error", "請檢查收款資料"));
  let receiptId: number | null = null;
  let failure: string | null = null;
  try {
    receiptId = await prisma.$transaction(async (tx) => {
      const invoice = await tx.arInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || !["POSTED", "PARTIALLY_RECEIVED"].includes(invoice.status)) throw new Error("只有已立帳或部分收款的應收發票可以收款");
      if (parsed.data.amount > Number(invoice.remainingBalance) + 0.0001) throw new Error("收款金額不可超過未收餘額");
      const receiptDate = parseDate(parsed.data.receiptDate, true)!;
      const number = await nextDocumentNumber(tx, invoice.companyId, "RECEIPT", "RC", receiptDate);
      const receipt = await tx.receipt.create({
        data: {
          companyId: invoice.companyId,
          customerId: invoice.customerId,
          number,
          receiptDate,
          paymentMethod: parsed.data.paymentMethod,
          currency: invoice.currency,
          exchangeRate: invoice.exchangeRate,
          totalAmount: parsed.data.amount.toFixed(2),
          status: "ALLOCATED",
          confirmedAt: new Date(),
          note: parsed.data.note || null,
          allocations: { create: { arInvoiceId: invoice.id, amount: parsed.data.amount.toFixed(2) } },
        },
      });
      const remaining = Number(invoice.remainingBalance) - parsed.data.amount;
      await tx.arInvoice.update({ where: { id: invoice.id }, data: { remainingBalance: remaining.toFixed(2), status: remaining <= 0.0001 ? "PAID" : "PARTIALLY_RECEIVED" } });
      return receipt.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || receiptId === null) redirect(messagePath(`/ar-invoices/${invoiceId}`, "error", failure ?? "收款失敗"));
  revalidatePath("/ar-invoices");
  revalidatePath("/receipts");
  redirect(`/receipts/${receiptId}?success=${encodeURIComponent("收款與沖帳已完成")}`);
}
